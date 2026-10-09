from __future__ import annotations

import math
import os
import re
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field


# ----------------- 1. Schema Definitions -----------------

class ResumeExtraction(BaseModel):
    skills: list[str] = Field(default_factory=list, description="List of technical skills found in the resume")
    projects: list[str] = Field(default_factory=list, description="Names of projects listed in the resume")
    certificates: list[str] = Field(default_factory=list, description="Names of certificates or courses found")
    cgpa: float | None = Field(default=None, description="The CGPA or GPA if explicitly stated, otherwise null")


class JDExtraction(BaseModel):
    company: str | None = Field(default=None, description="Company name only when explicitly stated")
    role: str | None = Field(default=None, description="Job role or title, only when explicitly stated")
    required_skills: list[str] = Field(default_factory=list, description="List of required technical skills, tools, and languages")
    branches: list[str] = Field(default_factory=list, description="Eligible engineering branches, only when explicitly stated")
    min_cgpa: float | None = Field(default=None, description="Minimum CGPA cutoff if specified, e.g. 7.0, 7.5, 8.0")
    max_backlogs: int | None = Field(default=None, description="Maximum allowed active backlogs if specified, e.g. 0")
    ctc: float | None = Field(default=None, description="Total stated CTC in LPA; return null if not stated or ambiguous")
    drive_date: str | None = Field(default=None, description="Explicit drive/interview date as YYYY-MM-DD; return null if year/date is incomplete")
    slot: str | None = Field(default=None, description="Explicit interview/drive time slot")
    venue: str | None = Field(default=None, description="Explicit drive/interview venue or location")


class JDScheduleExtraction(BaseModel):
    drive_date: str | None = Field(default=None, description="Explicit drive/interview date as YYYY-MM-DD; null if absent or incomplete")
    slot: str | None = Field(default=None, description="Explicit interview/drive time slot; null if absent")
    venue: str | None = Field(default=None, description="Explicit drive/interview venue; null if absent")


class FitExplanation(BaseModel):
    reasons: list[str] = Field(description="3 to 4 concise bullet points explaining why the candidate matches or what they lack.")


from typing import Callable, Any

# ----------------- Key Rotation Pool Manager -----------------
_current_key_idx = 0


def _get_api_keys() -> list[str]:
    """Retrieves all configured API keys from GEMINI_API_KEYS (comma-separated) or single GEMINI_API_KEY."""
    raw_keys = os.getenv("GEMINI_API_KEYS", "")
    keys = [k.strip() for k in raw_keys.split(",") if k.strip()]

    # Backward compatibility with single key environment variables
    for single in [os.getenv("GEMINI_API_KEY"), os.getenv("GOOGLE_API_KEY")]:
        if single and single.strip() and single.strip() not in keys:
            keys.append(single.strip())

    return keys


def _get_api_key() -> str | None:
    """Returns the currently active API key from the pool."""
    keys = _get_api_keys()
    if not keys:
        return None
    global _current_key_idx
    return keys[_current_key_idx % len(keys)]


def gemini_is_configured() -> bool:
    return bool(_get_api_keys())


def _execute_with_key_rotation(task_name: str, fn: Callable[[str], Any], fallback_fn: Callable[[], Any]) -> Any:
    """Executes a Gemini operation with automatic failover to the next key if quota or rate limit is hit."""
    keys = _get_api_keys()
    if not keys:
        return fallback_fn()

    global _current_key_idx
    total_keys = len(keys)
    start_idx = _current_key_idx

    for attempt in range(total_keys):
        idx = (start_idx + attempt) % total_keys
        key = keys[idx]
        masked = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else "***"
        try:
            result = fn(key)
            _current_key_idx = idx
            return result
        except Exception as e:
            err_msg = str(e)
            print(f"[Gemini Key Pool] Key #{idx + 1} ({masked}) failed on {task_name}: {err_msg}")
            if attempt < total_keys - 1:
                next_idx = (idx + 1) % total_keys
                next_masked = f"{keys[next_idx][:6]}...{keys[next_idx][-4:]}" if len(keys[next_idx]) > 10 else "***"
                print(f"[Gemini Key Pool] -> Auto-switching to Key #{next_idx + 1} ({next_masked})")
                continue
            else:
                print(f"[Gemini Key Pool] All {total_keys} keys exhausted for {task_name}. Using rule-based fallback.")

    return fallback_fn()


# ----------------- 2. Resume Parsing (Engine 1) -----------------

def _fallback_parse_resume(text: str) -> dict:
    common_skills = [
        "python", "javascript", "typescript", "react", "node.js", "next.js",
        "sql", "mongodb", "fastapi", "docker", "aws", "git", "java", "c++",
        "html", "css", "machine learning", "data science", "tailwind", "express"
    ]
    lower = text.lower()
    skills = [s.title() for s in common_skills if re.search(r'\b' + re.escape(s) + r'\b', lower)]

    cgpa = None
    cgpa_match = re.search(r'\b(?:cgpa|gpa)\s*[:=|\-–—]?\s*([0-9]+(?:\.[0-9]+)?)\b', lower)
    if cgpa_match:
        try:
            cgpa = float(cgpa_match.group(1))
        except ValueError:
            pass

    return {
        "skills": skills,
        "projects": [],
        "certificates": [],
        "cgpa": cgpa
    }


def parse_resume(resume_text: str) -> dict:
    """Extracts structured skills, projects, certificates, and CGPA from resume text with multi-key failover."""
    def _run(key: str) -> dict:
        llm = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            temperature=0.1,
            api_key=key
        )
        structured_llm = llm.with_structured_output(ResumeExtraction)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert technical recruiter. Extract the following information accurately from the provided resume text."),
            ("human", "Resume Text:\n{resume_text}")
        ])
        chain = prompt | structured_llm
        result: ResumeExtraction = chain.invoke({"resume_text": resume_text})
        return result.model_dump()

    return _execute_with_key_rotation(
        "parse_resume",
        _run,
        lambda: _fallback_parse_resume(resume_text)
    )


# Backwards compatibility alias
parse_resume_text = parse_resume



# ----------------- 3. Job Description Parsing (Engine 3) -----------------

def _fallback_parse_jd(text: str) -> dict:
    common_skills = [
        "python", "javascript", "typescript", "react", "node.js", "next.js",
        "sql", "mongodb", "fastapi", "docker", "aws", "git", "java", "c++",
        "html", "css", "machine learning", "data science", "tailwind", "express"
    ]
    lower = text.lower()
    skills = [s.title() for s in common_skills if re.search(r'\b' + re.escape(s) + r'\b', lower)]

    def labeled_value(label_pattern: str) -> str | None:
        pattern = re.compile(rf'^\s*(?:{label_pattern})\s*(?:\||:|=|-)\s*(.*?)\s*$', re.IGNORECASE)
        for line in text.splitlines():
            match = pattern.match(line)
            if match and match.group(1).strip():
                return match.group(1).strip()
        return None

    company = labeled_value(r'company|employer|organization')

    branch_match = re.search(r'\b(?:eligible\s+)?branch(?:es)?\s*[:=|\-–—]\s*([^\n]+)', text, re.IGNORECASE)
    branch_text = branch_match.group(1).lower() if branch_match else ''
    branches = []
    branch_patterns = [
        ('CSE', r'\bcse\b|computer\s+science'),
        ('IT', r'\bit\b|information\s+technology'),
        ('ECE', r'\bece\b|electronics\s*(?:and|&)\s*communication'),
        ('EE', r'\bee\b|electrical\s*(?:and|&)\s*(?:electronics\s*)?engineering'),
        ('MECH', r'\bmech\b|mechanical\s+engineering'),
        ('CIVIL', r'\bcivil\b'),
    ]
    for branch, pattern in branch_patterns:
        if re.search(pattern, branch_text):
            branches.append(branch)

    cgpa = None
    cgpa_match = re.search(r'\b(?:cgpa|gpa)\s*[:=|\-–—]?\s*([0-9]+(?:\.[0-9]+)?)\b', lower)
    if cgpa_match:
        try:
            cgpa = float(cgpa_match.group(1))
        except ValueError:
            pass

    backlogs = None
    backlog_match = re.search(
        r'\b(?:backlogs?|standing\s+backlogs?)\s*[:=|\-–—]?\s*([0-9]+)\b|'
        r'\b(?:maximum|max|up\s+to)\s+([0-9]+)\s+(?:active\s+)?backlogs?\b',
        lower,
    )
    if backlog_match:
        try:
            backlogs = int(next(value for value in backlog_match.groups() if value is not None))
        except ValueError:
            pass

    role_match = re.search(r'\b(?:job\s+title|position|role)\s*[:|\-–—]\s*([^\n|]+)', text, re.IGNORECASE)
    role = role_match.group(1).strip()[:120] if role_match else None

    ctc_value = labeled_value(r'ctc(?:\s*\([^)]*\))?|total\s+(?:compensation|package)|salary')
    ctc = None
    if ctc_value:
        ctc_match = re.match(r'\s*([0-9]+(?:\.[0-9]+)?)\s*(?:lpa|lakhs?(?:\s+per\s+annum)?|/\s*year)\b', ctc_value, re.IGNORECASE)
        if ctc_match:
            ctc = float(ctc_match.group(1))

    date_value = labeled_value(r'drive\s+date|interview\s+date|date')
    drive_date = None
    if date_value:
        for date_format in ('%d %B %Y', '%d %b %Y', '%B %d, %Y', '%b %d, %Y', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'):
            try:
                drive_date = datetime.strptime(date_value, date_format).date().isoformat()
                break
            except ValueError:
                continue

    slot = labeled_value(r'time\s+slot|interview\s+slot|slot|timing')
    venue = labeled_value(r'venue|location')
    return {
        "company": company,
        "role": role,
        "required_skills": skills,
        "branches": branches,
        "min_cgpa": cgpa,
        "max_backlogs": backlogs,
        "ctc": ctc,
        "drive_date": drive_date,
        "slot": slot,
        "venue": venue,
    }


def parse_jd(jd_text: str) -> dict:
    """Extracts job role, required skills, eligible branches, min CGPA, and max backlogs from JD with multi-key failover."""
    def _run(key: str) -> dict:
        llm = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            temperature=0.1,
            api_key=key
        )
        structured_llm = llm.with_structured_output(JDExtraction)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a strict technical campus recruitment analyst. Extract company, role, required skills, eligible branches, minimum CGPA, maximum backlogs, total CTC in LPA, drive/interview date, time slot, and venue. Extract only values explicitly stated in the job description; never infer, guess, or use generic defaults. Return null for missing scalar values and an empty list for missing lists. Return dates as YYYY-MM-DD only when a complete date including year is stated. For CTC, use the explicitly stated total package only; if the total is ambiguous, return null. Treat pipe-delimited table rows as structured requirements and distinguish the labelled value from other text in the row."),
            ("human", "Job Description Text:\n{jd_text}")
        ])
        chain = prompt | structured_llm
        result: JDExtraction = chain.invoke({"jd_text": jd_text})
        return result.model_dump()

    return _execute_with_key_rotation(
        "parse_jd",
        _run,
        lambda: _fallback_parse_jd(jd_text)
    )


def _fallback_parse_jd_schedule(text: str) -> dict:
    def labeled_value(label_pattern: str) -> str | None:
        pattern = re.compile(rf'^\s*(?:{label_pattern})\s*(?:\||:|=|-|–|—)\s*(.*?)\s*$', re.IGNORECASE)
        for line in text.splitlines():
            match = pattern.match(line)
            if match and match.group(1).strip():
                return match.group(1).strip()
        return None

    date_value = labeled_value(r'drive\s+date|interview\s+date|date')
    drive_date = None
    if date_value:
        for date_format in ('%d %B %Y', '%d %b %Y', '%B %d, %Y', '%b %d, %Y', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'):
            try:
                drive_date = datetime.strptime(date_value, date_format).date().isoformat()
                break
            except ValueError:
                continue

    return {
        'drive_date': drive_date,
        'slot': labeled_value(r'time\s+slot|interview\s+slot|slot|timing'),
        'venue': labeled_value(r'venue|location'),
    }


def parse_jd_schedule(jd_text: str) -> dict:
    """Extract only explicitly stated date, time, and venue from a job description."""
    def _run(key: str) -> dict:
        llm = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            temperature=0.1,
            api_key=key,
        )
        structured_llm = llm.with_structured_output(JDScheduleExtraction)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Extract only an explicitly stated drive/interview date, time slot, and venue from this job description. Do not extract or infer company, role, skills, eligibility, salary, or any other fields. Never guess missing values. Return dates as YYYY-MM-DD only when the complete date including year is stated; otherwise return null."),
            ("human", "Job Description Text:\n{jd_text}"),
        ])
        chain = prompt | structured_llm
        result: JDScheduleExtraction = chain.invoke({"jd_text": jd_text})
        return result.model_dump()

    return _execute_with_key_rotation(
        "parse_jd_schedule",
        _run,
        lambda: _fallback_parse_jd_schedule(jd_text),
    )


# ----------------- 4. Semantic Matching (Engine 5) -----------------

def get_semantic_similarity(student_skills: list[str], required_skills: list[str]) -> float:
    """Calculates match ratio between student skills and job requirements (0.0 to 1.0) using smart token and alias normalization."""
    if not student_skills or not required_skills:
        return 0.0

    try:
        from students import match_required_skill
        matched_count = 0
        for req in required_skills:
            matched, _ = match_required_skill(req, student_skills)
            if matched:
                matched_count += 1
        return round(matched_count / max(1, len(required_skills)), 2)
    except Exception:
        s_set = {s.lower() for s in student_skills}
        r_set = {s.lower() for s in required_skills}
        return round(len(s_set & r_set) / max(1, len(r_set)), 2)


# ----------------- 5. Explanation Generation (Engine 6) -----------------

def generate_explanation(role: str, score: float, matched: list[str], missing: list[str], projects: int) -> list[str]:
    """Generates natural language match reasons and missing gap analysis with multi-key failover."""
    def _fallback_reasons() -> list[str]:
        fallback_reasons = [
            f"Matches {len(matched)} required skills ({', '.join(matched[:3]) if matched else 'None'})",
            f"Candidate has {projects} documented project(s)",
            f"Computed fit score: {score}/100",
        ]
        if missing:
            fallback_reasons.append(f"Missing recommended skills: {', '.join(missing[:3])}")
        return fallback_reasons

    def _run(key: str) -> list[str]:
        llm = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            temperature=0.2,
            api_key=key
        )
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert technical recruiter analyzing a candidate's fit for a role. Provide 3 to 4 concise bullet points explaining their match based on the provided data. Be highly specific. Highlight strengths and explicitly mention critical missing skills if any."),
            ("human", "Role: {role}\nFit Score: {score}/100\nMatched Skills: {matched}\nMissing Skills: {missing}\nProjects: {projects}")
        ])
        chain = prompt | llm.with_structured_output(FitExplanation)
        result = chain.invoke({
            "role": role,
            "score": score,
            "matched": ", ".join(matched) or "None",
            "missing": ", ".join(missing) or "None",
            "projects": projects
        })
        return result.model_dump()["reasons"]

    return _execute_with_key_rotation(
        "generate_explanation",
        _run,
        _fallback_reasons
    )