from __future__ import annotations

import math
import os
import re
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from collections import OrderedDict
import threading
import numpy as np
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


def _execute_with_key_rotation_with_status(
    task_name: str,
    fn: Callable[[str], Any],
    fallback_fn: Callable[[], Any]
) -> tuple[Any, str, bool, str | None]:
    """
    Executes a Gemini operation with failover and returns:
    (result, provider_name, fallback_used, fallback_reason)
    Never exposes or returns API key strings.
    """
    keys = _get_api_keys()
    if not keys:
        res = fallback_fn()
        return res, "rule_based_fallback", True, "Gemini API keys are not configured"

    global _current_key_idx
    total_keys = len(keys)
    start_idx = _current_key_idx

    for attempt in range(total_keys):
        idx = (start_idx + attempt) % total_keys
        key = keys[idx]
        try:
            result = fn(key)
            _current_key_idx = idx
            return result, "gemini", False, None
        except Exception as e:
            err_msg = str(e)
            print(f"[Gemini Key Pool] Key #{idx + 1} failed on {task_name}: {err_msg}")
            if attempt < total_keys - 1:
                next_idx = (idx + 1) % total_keys
                print(f"[Gemini Key Pool] -> Auto-switching to Key #{next_idx + 1}")
                continue
            else:
                print(f"[Gemini Key Pool] All {total_keys} keys exhausted for {task_name}. Using rule-based fallback.")

    res = fallback_fn()
    return res, "rule_based_fallback", True, "Gemini provider calls failed across all keys; switched to rule-based fallback"


def _execute_with_key_rotation(task_name: str, fn: Callable[[str], Any], fallback_fn: Callable[[], Any]) -> Any:
    """Executes a Gemini operation with automatic failover to the next key if quota or rate limit is hit."""
    res, _, _, _ = _execute_with_key_rotation_with_status(task_name, fn, fallback_fn)
    return res


# ----------------- 2. Resume Parsing (Engine 1) -----------------

def _extract_projects_fallback(text: str) -> list[str]:
    """Conservative, explainable project extraction from resume text without hallucination."""
    projects: list[str] = []
    lines = text.splitlines()
    in_project_section = False

    header_pattern = re.compile(r'^\s*(?:academic\s+|personal\s+|key\s+|selected\s+)?projects?\b', re.IGNORECASE)
    next_section_pattern = re.compile(
        r'^\s*(?:education|experience|work\s+experience|employment|certifications?|certificates?|skills?|technical\s+skills?|achievements?|awards?|publications?|contact|summary|profile)\b',
        re.IGNORECASE
    )
    labeled_pattern = re.compile(r'^\s*(?:project(?:\s+name)?|title)\s*[:\-–—]\s*(.+)$', re.IGNORECASE)

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        labeled_match = labeled_pattern.match(stripped)
        if labeled_match:
            cand = labeled_match.group(1).strip()
            cand = re.split(r'\(http|\bhttps?://', cand)[0].strip(' -:|')
            if cand and len(cand) <= 80 and cand not in projects:
                projects.append(cand)
            continue

        if header_pattern.match(stripped) and len(stripped) < 40:
            in_project_section = True
            continue

        if in_project_section:
            if next_section_pattern.match(stripped) and len(stripped) < 40:
                in_project_section = False
                continue

            bullet_match = re.match(r'^(?:[•\-\*▪►\d+\.]|\(\d+\))\s*(.+)$', stripped)
            item_text = bullet_match.group(1).strip() if bullet_match else stripped
            title_part = re.split(r'\s*(?:[-–—|:]|\busing\b|\bbuilt\s+with\b|\bwith\b|\(http|\bhttps?://)\s*', item_text, flags=re.IGNORECASE)[0].strip()

            words = title_part.split()
            first_word_lower = words[0].lower() if words else ""
            action_verbs = {
                "developed", "created", "built", "designed", "implemented",
                "worked", "managed", "led", "participated", "engineered",
                "utilized", "contributed", "assisted"
            }

            if (
                title_part
                and len(title_part) <= 70
                and len(words) <= 7
                and first_word_lower not in action_verbs
                and title_part not in projects
            ):
                projects.append(title_part)
                if len(projects) >= 6:
                    break

    if not projects:
        gh_matches = re.findall(r'github\.com/[A-Za-z0-9_.-]+/([A-Za-z0-9_.-]+)', text)
        for repo in gh_matches:
            repo_clean = repo.strip().rstrip('.git')
            if repo_clean and repo_clean.lower() not in {"profile", "readme", "portfolio"} and repo_clean not in projects:
                projects.append(repo_clean)
                if len(projects) >= 4:
                    break

    return projects[:6]


def _extract_certificates_fallback(text: str) -> list[str]:
    """Conservative, explainable certificate extraction from resume text without hallucination."""
    certs: list[str] = []
    lines = text.splitlines()
    in_cert_section = False

    header_pattern = re.compile(r'^\s*(?:certifications?|certificates?|licenses?\s*&\s*certifications?|courses?\s*&\s*certifications?)\b', re.IGNORECASE)
    next_section_pattern = re.compile(
        r'^\s*(?:education|experience|work\s+experience|projects?|skills?|technical\s+skills?|achievements?|awards?|contact|summary|profile)\b',
        re.IGNORECASE
    )
    labeled_pattern = re.compile(r'^\s*(?:certificate|certification)\s*[:\-–—]\s*(.+)$', re.IGNORECASE)

    cert_keywords = [
        "certified", "certificate", "certification", "specialization", "course",
        "aws", "azure", "gcp", "cisco", "red hat", "oracle", "udemy", "coursera",
        "nptel", "hackerrank", "freecodecamp"
    ]

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        labeled_match = labeled_pattern.match(stripped)
        if labeled_match:
            cand = labeled_match.group(1).strip()
            cand = re.split(r'\(http|\bhttps?://', cand)[0].strip(' -:|')
            if cand and len(cand) <= 90 and cand not in certs:
                certs.append(cand)
            continue

        if header_pattern.match(stripped) and len(stripped) < 40:
            in_cert_section = True
            continue

        if in_cert_section:
            if next_section_pattern.match(stripped) and len(stripped) < 40:
                in_cert_section = False
                continue

            bullet_match = re.match(r'^(?:[•\-\*▪►\d+\.]|\(\d+\))\s*(.+)$', stripped)
            item_text = bullet_match.group(1).strip() if bullet_match else stripped
            cand = re.split(r'\(http|\bhttps?://', item_text)[0].strip(' -:|')

            if cand and len(cand) <= 90 and len(cand.split()) <= 10 and cand not in certs:
                lower_cand = cand.lower()
                if any(k in lower_cand for k in cert_keywords) or bullet_match:
                    certs.append(cand)
                    if len(certs) >= 6:
                        break

    return certs[:6]


def _fallback_parse_resume(text: str) -> dict:
    canonical_skills = {
        "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
        "react": "React", "node.js": "Node.js", "next.js": "Next.js", "sql": "SQL",
        "mongodb": "MongoDB", "fastapi": "FastAPI", "docker": "Docker", "aws": "AWS",
        "git": "Git", "java": "Java", "c++": "C++", "c#": "C#", "html": "HTML",
        "css": "CSS", "machine learning": "Machine Learning", "data science": "Data Science",
        "tailwind": "Tailwind", "express": "Express", "kubernetes": "Kubernetes",
        "flutter": "Flutter", "vue": "Vue", "angular": "Angular", "django": "Django",
        "flask": "Flask", "spring boot": "Spring Boot", "postgresql": "PostgreSQL",
        "mysql": "MySQL", "redis": "Redis", "graphql": "GraphQL", "linux": "Linux",
        "go": "Go", "rust": "Rust", "kotlin": "Kotlin", "pytorch": "PyTorch",
        "tensorflow": "TensorFlow", "pandas": "Pandas", "numpy": "NumPy",
        "rest api": "REST API", "ci/cd": "CI/CD"
    }

    lower = text.lower()
    skills: list[str] = []
    for skill_kw, canonical in canonical_skills.items():
        if re.search(r'\b' + re.escape(skill_kw) + r'\b', lower):
            if canonical not in skills:
                skills.append(canonical)

    cgpa = None
    cgpa_match = re.search(r'\b(?:cgpa|gpa)\s*[:=|\-–—]?\s*([0-9]+(?:\.[0-9]+)?)(?:\s*(?:/|out of)\s*10(?:\.0)?)?\b', lower)
    if cgpa_match:
        try:
            val = float(cgpa_match.group(1))
            if 0.0 <= val <= 10.0:
                cgpa = val
        except ValueError:
            pass

    projects = _extract_projects_fallback(text)
    certificates = _extract_certificates_fallback(text)

    return {
        "skills": skills,
        "projects": projects,
        "certificates": certificates,
        "cgpa": cgpa,
        "parsing_provider": "rule_based_fallback",
        "fallback_used": True,
        "fallback_reason": "Rule-based fallback parser invoked directly",
    }


def parse_resume(resume_text: str) -> dict:
    """Extracts structured skills, projects, certificates, and CGPA from resume text with multi-key failover and provider metadata."""
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
        result: Any = chain.invoke({"resume_text": resume_text})
        return result.model_dump() if hasattr(result, "model_dump") else dict(result)

    result, provider, fallback_used, fallback_reason = _execute_with_key_rotation_with_status(
        "parse_resume",
        _run,
        lambda: _fallback_parse_resume(resume_text)
    )
    if isinstance(result, dict):
        result["parsing_provider"] = provider
        result["fallback_used"] = fallback_used
        result["fallback_reason"] = fallback_reason
    return result


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
        "parsing_provider": "rule_based_fallback",
        "fallback_used": True,
        "fallback_reason": "Rule-based fallback parser invoked directly",
    }


def parse_jd(jd_text: str) -> dict:
    """Extracts job role, required skills, eligible branches, min CGPA, and max backlogs from JD with multi-key failover and provider metadata."""
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
        result: Any = chain.invoke({"jd_text": jd_text})
        return result.model_dump() if hasattr(result, "model_dump") else dict(result)

    result, provider, fallback_used, fallback_reason = _execute_with_key_rotation_with_status(
        "parse_jd",
        _run,
        lambda: _fallback_parse_jd(jd_text)
    )
    if isinstance(result, dict):
        result["parsing_provider"] = provider
        result["fallback_used"] = fallback_used
        result["fallback_reason"] = fallback_reason
    return result


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
    """Extract only explicitly stated date, time, and venue from a job description with multi-key failover and provider metadata."""
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
        result: Any = chain.invoke({"jd_text": jd_text})
        return result.model_dump() if hasattr(result, "model_dump") else dict(result)

    result, provider, fallback_used, fallback_reason = _execute_with_key_rotation_with_status(
        "parse_jd_schedule",
        _run,
        lambda: _fallback_parse_jd_schedule(jd_text),
    )
    if isinstance(result, dict):
        result["parsing_provider"] = provider
        result["fallback_used"] = fallback_used
        result["fallback_reason"] = fallback_reason
    return result


# ----------------- 4. Semantic Matching (Engine 5) -----------------

# Default threshold is 0.72 (configurable via SEMANTIC_SIMILARITY_THRESHOLD env var).
# Note: This threshold is a documented baseline heuristic for Gemini text-embedding-004 vectors,
# and is not claimed as an empirically validated cutoff across arbitrary recruitment domains.
DEFAULT_SEMANTIC_THRESHOLD: float = float(os.getenv("SEMANTIC_SIMILARITY_THRESHOLD", "0.72"))
DEFAULT_EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2-preview")
DEFAULT_CACHE_SIZE: int = int(os.getenv("EMBEDDING_CACHE_SIZE", "1024"))

_EMBEDDING_CACHE_LOCK = threading.Lock()
_EMBEDDING_CACHE: OrderedDict[tuple[str, str], list[float]] = OrderedDict()


def get_embedding_cache_size() -> int:
    """Returns the current number of cached embedding entries."""
    with _EMBEDDING_CACHE_LOCK:
        return len(_EMBEDDING_CACHE)


def clear_embedding_cache() -> None:
    """Clears all in-memory cached embeddings."""
    with _EMBEDDING_CACHE_LOCK:
        _EMBEDDING_CACHE.clear()


def _get_cached_embedding(model: str, text: str) -> list[float] | None:
    key = (model, text.strip().lower())
    with _EMBEDDING_CACHE_LOCK:
        if key in _EMBEDDING_CACHE:
            _EMBEDDING_CACHE.move_to_end(key)
            return _EMBEDDING_CACHE[key]
    return None


def _put_cached_embeddings(model: str, text_vec_pairs: list[tuple[str, list[float]]], max_size: int = DEFAULT_CACHE_SIZE) -> None:
    with _EMBEDDING_CACHE_LOCK:
        for text, vec in text_vec_pairs:
            key = (model, text.strip().lower())
            if key in _EMBEDDING_CACHE:
                _EMBEDDING_CACHE.move_to_end(key)
            else:
                if len(_EMBEDDING_CACHE) >= max_size:
                    _EMBEDDING_CACHE.popitem(last=False)
                _EMBEDDING_CACHE[key] = vec


def compute_cosine_similarity(v1: list[float] | np.ndarray, v2: list[float] | np.ndarray) -> float:
    """Computes cosine similarity between two numeric vectors in the [-1.0, 1.0] range."""
    a = np.asarray(v1, dtype=np.float64)
    b = np.asarray(v2, dtype=np.float64)
    norm_a = float(np.linalg.norm(a))
    norm_b = float(np.linalg.norm(b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    dot = float(np.dot(a, b))
    sim = dot / (norm_a * norm_b)
    return float(np.clip(sim, -1.0, 1.0))


def embed_texts(texts: list[str], model: str | None = None) -> list[list[float]]:
    """
    Embeds a list of bounded text strings using Gemini GoogleGenerativeAIEmbeddings.
    Checks the in-memory LRU cache first to prevent repeated calls for unchanged text.
    Validates vectors against NaN, Inf, and near-zero norms.
    """
    if not texts:
        return []

    model_name = model or os.getenv("GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)

    cached_vectors: dict[int, list[float]] = {}
    missing_indices: list[int] = []
    missing_texts: list[str] = []

    for idx, text in enumerate(texts):
        cached = _get_cached_embedding(model_name, text)
        if cached is not None:
            cached_vectors[idx] = cached
        else:
            missing_indices.append(idx)
            missing_texts.append(text)

    if not missing_texts:
        return [cached_vectors[i] for i in range(len(texts))]

    def _run_embedding(api_key: str) -> list[list[float]]:
        emb_client = GoogleGenerativeAIEmbeddings(
            model=model_name,
            google_api_key=api_key,
        )
        raw_vecs = emb_client.embed_documents(missing_texts)
        if not isinstance(raw_vecs, list) or len(raw_vecs) != len(missing_texts):
            raise ValueError(f"Expected {len(missing_texts)} embedding vectors, got {len(raw_vecs) if isinstance(raw_vecs, list) else type(raw_vecs)}")

        validated: list[list[float]] = []
        for v in raw_vecs:
            if not isinstance(v, (list, tuple)) or len(v) == 0:
                raise ValueError("Embedding provider returned empty or non-sequence vector")
            arr = np.asarray(v, dtype=np.float64)
            if np.isnan(arr).any() or np.isinf(arr).any() or float(np.linalg.norm(arr)) < 1e-6:
                raise ValueError("Embedding provider returned invalid vector (NaN, Inf, or near-zero norm)")
            validated.append(arr.tolist())
        return validated

    new_vectors = _execute_with_key_rotation(
        "embed_texts",
        _run_embedding,
        lambda: None
    )

    if new_vectors is None:
        raise RuntimeError("Embedding provider failed to generate vectors across all keys.")

    to_cache = [(missing_texts[i], new_vectors[i]) for i in range(len(missing_texts))]
    _put_cached_embeddings(model_name, to_cache)

    for idx, vec in zip(missing_indices, new_vectors):
        cached_vectors[idx] = vec

    return [cached_vectors[i] for i in range(len(texts))]


def _deterministic_fallback(
    student_skills: list[str],
    required_skills: list[str],
    resume_text: str = '',
    threshold: float = DEFAULT_SEMANTIC_THRESHOLD
) -> dict:
    from students import match_required_skill
    matched_skills = []
    missing_skills = []
    match_details = []

    for req in required_skills:
        is_match, matched_kws = match_required_skill(req, student_skills, resume_text)
        if is_match:
            matched_skills.append(req)
            match_details.append({
                'skill': req,
                'matched': True,
                'matched_by': matched_kws,
                'similarity': 1.0,
            })
        else:
            missing_skills.append(req)
            match_details.append({
                'skill': req,
                'matched': False,
                'matched_by': [],
                'similarity': 0.0,
            })

    total = len(required_skills)
    similarity = round(len(matched_skills) / max(1, total), 2) if total > 0 else 0.0
    return {
        'similarity': similarity,
        'matched_skills': matched_skills,
        'missing_skills': missing_skills,
        'match_provider': 'deterministic_fallback',
        'match_details': match_details,
        'threshold_used': threshold,
    }


def semantic_match_skills(
    student_skills: list[str],
    required_skills: list[str],
    resume_text: str = '',
    threshold: float | None = None
) -> dict:
    """
    Computes genuine embedding-based semantic matching between student parsed skills
    and job requirements using cosine similarity.
    If Gemini is unconfigured, errors, times out, or returns invalid vectors,
    gracefully falls back to the deterministic rule-based matcher with clear attribution.
    """
    sim_threshold = threshold if threshold is not None else DEFAULT_SEMANTIC_THRESHOLD

    if not required_skills:
        return {
            'similarity': 1.0,
            'matched_skills': [],
            'missing_skills': [],
            'match_provider': 'gemini_embedding',
            'match_details': [],
            'threshold_used': sim_threshold,
        }

    if not student_skills:
        return {
            'similarity': 0.0,
            'matched_skills': [],
            'missing_skills': list(required_skills),
            'match_provider': 'gemini_embedding',
            'match_details': [
                {'skill': r, 'matched': False, 'matched_by': [], 'similarity': 0.0}
                for r in required_skills
            ],
            'threshold_used': sim_threshold,
        }

    # If Gemini is not configured, directly use deterministic fallback
    if not gemini_is_configured():
        return _deterministic_fallback(student_skills, required_skills, resume_text, sim_threshold)

    # Prepare bounded texts: student skills and required skills
    clean_student_skills = [s.strip() for s in student_skills if s and s.strip()][:50]
    unique_student_skills = list(dict.fromkeys(clean_student_skills))

    req_phrases: list[str] = []
    for r in required_skills:
        r_clean = r.strip()
        if not r_clean:
            continue
        req_phrases.append(r_clean)
        or_parts = [p.strip() for p in re.split(r'\s+or\s+|\s*/\s*', r_clean, flags=re.IGNORECASE) if p.strip()]
        if len(or_parts) > 1:
            req_phrases.extend(or_parts)
        and_parts = [p.strip() for p in re.split(r'\s+and\s+|\s*&\s*', r_clean, flags=re.IGNORECASE) if p.strip()]
        if len(and_parts) > 1:
            req_phrases.extend(and_parts)

    all_texts_to_embed = list(dict.fromkeys(unique_student_skills + [p for p in req_phrases if p]))

    try:
        all_vectors = embed_texts(all_texts_to_embed)
    except Exception as e:
        print(f"[Semantic Matching] Embedding failed ({e}). Falling back to deterministic matcher.")
        return _deterministic_fallback(student_skills, required_skills, resume_text, sim_threshold)

    vec_map = {text: vec for text, vec in zip(all_texts_to_embed, all_vectors)}
    student_vecs = [(s, vec_map[s]) for s in unique_student_skills if s in vec_map]

    if not student_vecs:
        return _deterministic_fallback(student_skills, required_skills, resume_text, sim_threshold)

    def _match_single_phrase(phrase: str) -> tuple[bool, str, float]:
        phrase_clean = phrase.strip()
        phrase_vec = vec_map.get(phrase_clean)
        if not phrase_vec or not student_vecs:
            return False, "", 0.0

        best_skill = ""
        best_sim = -1.0
        for s_text, s_vec in student_vecs:
            sim = compute_cosine_similarity(phrase_vec, s_vec)
            if sim > best_sim:
                best_sim = sim
                best_skill = s_text

        is_match = best_sim >= sim_threshold
        return is_match, best_skill, round(best_sim, 3)

    matched_skills: list[str] = []
    missing_skills: list[str] = []
    match_details: list[dict] = []

    for req in required_skills:
        req_clean = req.strip()
        if not req_clean:
            continue

        or_parts = [p.strip() for p in re.split(r'\s+or\s+|\s*/\s*', req_clean, flags=re.IGNORECASE) if p.strip()]
        and_parts = [p.strip() for p in re.split(r'\s+and\s+|\s*&\s*', req_clean, flags=re.IGNORECASE) if p.strip()]

        if len(or_parts) > 1:
            matched_any = False
            best_part_match = ""
            best_part_sim = 0.0
            for p in or_parts:
                m_ok, m_skill, m_sim = _match_single_phrase(p)
                if m_sim > best_part_sim:
                    best_part_sim = m_sim
                    best_part_match = m_skill
                if m_ok:
                    matched_any = True

            w_ok, w_skill, w_sim = _match_single_phrase(req_clean)
            if w_sim > best_part_sim:
                best_part_sim = w_sim
                best_part_match = w_skill
            if w_ok:
                matched_any = True

            if matched_any:
                matched_skills.append(req)
                match_details.append({
                    'skill': req,
                    'matched': True,
                    'matched_by': [best_part_match] if best_part_match else [],
                    'similarity': best_part_sim,
                })
            else:
                missing_skills.append(req)
                match_details.append({
                    'skill': req,
                    'matched': False,
                    'matched_by': [],
                    'similarity': best_part_sim,
                })

        elif len(and_parts) > 1:
            w_ok, w_skill, w_sim = _match_single_phrase(req_clean)
            if w_ok:
                matched_skills.append(req)
                match_details.append({
                    'skill': req,
                    'matched': True,
                    'matched_by': [w_skill],
                    'similarity': w_sim,
                })
            else:
                all_parts_ok = True
                matched_sub_kws = []
                min_sim = 1.0
                for p in and_parts:
                    p_ok, p_skill, p_sim = _match_single_phrase(p)
                    if p_sim < min_sim:
                        min_sim = p_sim
                    if p_ok:
                        matched_sub_kws.append(p_skill)
                    else:
                        all_parts_ok = False

                if all_parts_ok and len(matched_sub_kws) == len(and_parts):
                    matched_skills.append(req)
                    match_details.append({
                        'skill': req,
                        'matched': True,
                        'matched_by': matched_sub_kws,
                        'similarity': min_sim,
                    })
                else:
                    missing_skills.append(req)
                    match_details.append({
                        'skill': req,
                        'matched': False,
                        'matched_by': matched_sub_kws,
                        'similarity': min_sim if min_sim < 1.0 else 0.0,
                    })

        else:
            s_ok, s_skill, s_sim = _match_single_phrase(req_clean)
            if s_ok:
                matched_skills.append(req)
                match_details.append({
                    'skill': req,
                    'matched': True,
                    'matched_by': [s_skill],
                    'similarity': s_sim,
                })
            else:
                missing_skills.append(req)
                match_details.append({
                    'skill': req,
                    'matched': False,
                    'matched_by': [],
                    'similarity': s_sim,
                })

    total = len(required_skills)
    similarity = round(len(matched_skills) / max(1, total), 2) if total > 0 else 0.0

    return {
        'similarity': similarity,
        'matched_skills': matched_skills,
        'missing_skills': missing_skills,
        'match_provider': 'gemini_embedding',
        'match_details': match_details,
        'threshold_used': sim_threshold,
    }


def get_semantic_similarity(student_skills: list[str], required_skills: list[str], resume_text: str = '') -> float:
    """Calculates match ratio between student skills and job requirements (0.0 to 1.0) using genuine embedding vector search or fallback."""
    res = semantic_match_skills(student_skills, required_skills, resume_text)
    return float(res.get('similarity', 0.0))


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
        result: Any = chain.invoke({
            "role": role,
            "score": score,
            "matched": ", ".join(matched) or "None",
            "missing": ", ".join(missing) or "None",
            "projects": projects
        })
        dump = result.model_dump() if hasattr(result, "model_dump") else dict(result)
        return dump.get("reasons", [])

    return _execute_with_key_rotation(
        "generate_explanation",
        _run,
        _fallback_reasons
    )