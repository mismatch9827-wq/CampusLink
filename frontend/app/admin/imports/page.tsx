"use client";
import React, { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  GraduationCap,
  History,
  Layers,
  Search,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";

type ImportTab = "master_students" | "historical_placements";

export default function MasterDataImportsPage() {
  const [activeTab, setActiveTab] = useState<ImportTab>("master_students");
  const [masterStudents, setMasterStudents] = useState<any[]>([]);
  const [historicalRecords, setHistoricalRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [masters, history] = await Promise.all([
        api.masterStudents(),
        api.historicalPlacements(),
      ]);
      setMasterStudents(masters || []);
      setHistoricalRecords(history || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }

  // 1. Upload Master Student CSV/XLSX
  async function handleMasterUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const res = await api.uploadMasterCsv(file);
      setNotice(
        `✅ Successfully imported Master Student records! ${res.created} created · ${res.updated} updated.`
      );
      const updated = await api.masterStudents();
      setMasterStudents(updated || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to import master students");
    } finally {
      setUploading(false);
    }
  }

  // 2. Upload Historical Placement CSV/XLSX
  async function handleHistoricalUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const res = await api.uploadHistoricalPlacements(file);
      setNotice(
        `✅ Successfully imported Past Placement records! ${res.created} created · ${res.updated} updated.`
      );
      const updated = await api.historicalPlacements();
      setHistoricalRecords(updated || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to import historical records");
    } finally {
      setUploading(false);
    }
  }

  // 3. Delete a historical record
  async function handleDeleteHistorical(id: string) {
    if (!confirm("Are you sure you want to remove this historical placement record?")) return;
    try {
      await api.deleteHistoricalPlacement(id);
      setHistoricalRecords((prev) => prev.filter((r) => r.id !== id));
      setNotice("Historical record deleted.");
      setTimeout(() => setNotice(""), 4000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete record");
    }
  }

  // Sample CSV Generators
  function downloadMasterSample() {
    const csvContent =
      "registration_number,name,branch,cgpa,backlogs,passing_year,email,aptitude,communication,mock_interview\n" +
      "2401114001,Aarav Sharma,CSE,9.1,0,2026,aarav.sharma01@gmail.com,85,90,88\n" +
      "2401114002,Priya Patel,IT,8.6,0,2026,priya.patel@gmail.com,78,82,80\n" +
      "2401114003,Rohan Verma,ECE,7.4,1,2026,rohan.verma@gmail.com,65,70,68\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Sample_Master_Students_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadHistoricalSample() {
    const csvContent =
      "batch_year,company,role,ctc,students_placed,branch\n" +
      "2025,Google,Software Engineer,32.0,3,CSE\n" +
      "2025,Microsoft,Software Engineer Trainee,24.5,5,CSE / IT\n" +
      "2024,Amazon,SDE-1,28.0,4,CSE\n" +
      "2024,TCS Digital,Associate Systems Engineer,7.5,35,ALL\n" +
      "2023,Infosys,Specialist Programmer,9.5,22,ALL\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Sample_Historical_Placements_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Filtered Master Students
  const filteredMasterStudents = useMemo(() => {
    if (!searchQuery.trim()) return masterStudents;
    const q = searchQuery.toLowerCase();
    return masterStudents.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.branch?.toLowerCase().includes(q) ||
        s.registration_number?.toLowerCase().includes(q)
    );
  }, [masterStudents, searchQuery]);

  // Unique Batch Years for filter
  const historicalYears = useMemo(() => {
    const set = new Set<string>();
    historicalRecords.forEach((r) => {
      if (r.batch_year) set.add(String(r.batch_year));
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [historicalRecords]);

  // Filtered Historical Records
  const filteredHistoricalRecords = useMemo(() => {
    let list = historicalRecords;
    if (selectedBatchFilter !== "all") {
      list = list.filter((r) => String(r.batch_year) === selectedBatchFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.company?.toLowerCase().includes(q) ||
          r.role?.toLowerCase().includes(q) ||
          r.branch?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [historicalRecords, selectedBatchFilter, searchQuery]);

  // Historical Summary Stats
  const historyStats = useMemo(() => {
    const totalPlaced = historicalRecords.reduce(
      (acc, r) => acc + (Number(r.students_placed) || 1),
      0
    );
    const packages = historicalRecords.map((r) => Number(r.ctc) || 0).filter((v) => v > 0);
    const maxCtc = packages.length ? Math.max(...packages) : 0;
    const avgCtc = packages.length
      ? Math.round((packages.reduce((a, b) => a + b, 0) / packages.length) * 10) / 10
      : 0;
    const distinctCompanies = new Set(historicalRecords.map((r) => r.company)).size;

    return { totalPlaced, maxCtc, avgCtc, distinctCompanies };
  }, [historicalRecords]);

  return (
    <DashboardShell
      role="admin"
      title="Master Data & Placement Imports"
      subtitle="Dedicated onboarding hub for student master eligibility data and historical college placement archives."
    >
      <div className="space-y-5">
        {/* Alerts */}
        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice("")} className="font-bold hover:underline">
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="font-bold hover:underline">
              ✕
            </button>
          </div>
        )}

        {/* Top Hub Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("master_students");
                setSearchQuery("");
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                activeTab === "master_students"
                  ? "bg-navy text-white shadow-md"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <GraduationCap size={16} />
              Current Student Master Data
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  activeTab === "master_students"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 text-slate-800"
                }`}
              >
                {masterStudents.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("historical_placements");
                setSearchQuery("");
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                activeTab === "historical_placements"
                  ? "bg-navy text-white shadow-md"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <History size={16} />
              Past Placement Archives
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  activeTab === "historical_placements"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200 text-slate-800"
                }`}
              >
                {historicalRecords.length}
              </span>
            </button>
          </div>

          <span className="text-xs text-slate-500 hidden sm:inline">
            Official Institutional Data Source
          </span>
        </div>

        {/* TAB 1: CURRENT STUDENT MASTER RECORDS */}
        {activeTab === "master_students" && (
          <section className="space-y-4">
            {/* Master Upload Banner */}
            <div className="panel p-5 bg-gradient-to-r from-slate-900 via-navy to-slate-900 text-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-300">
                      Official Source of Truth
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-lg font-black text-white flex items-center gap-2">
                    <Database size={20} className="text-teal-400" />
                    Upload Academic Student Master Records
                  </h3>
                  <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
                    Upload official college CSV or XLSX containing registration numbers, branches,
                    official CGPA, active backlogs, and passing years. Student academic eligibility
                    remains permanently locked to this source.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={downloadMasterSample}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 transition"
                  >
                    <Download size={14} /> Download Sample CSV
                  </button>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-teal-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg hover:bg-teal-300 transition">
                    <UploadCloud size={16} />
                    {uploading ? "Importing…" : "Upload Master CSV / Excel"}
                    <input
                      className="hidden"
                      type="file"
                      accept=".csv, .xlsx"
                      disabled={uploading}
                      onChange={(e) => handleMasterUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total Enrolled
                </span>
                <div className="mt-1 text-xl font-black text-slate-900">
                  {masterStudents.length}
                </div>
                <span className="text-[10px] text-slate-400">official records</span>
              </div>
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Onboarding Complete
                </span>
                <div className="mt-1 text-xl font-black text-emerald-600">
                  {masterStudents.filter((s) => s.has_profile).length}
                </div>
                <span className="text-[10px] text-slate-400">resumes uploaded</span>
              </div>
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Onboarding Pending
                </span>
                <div className="mt-1 text-xl font-black text-amber-600">
                  {masterStudents.filter((s) => !s.has_profile).length}
                </div>
                <span className="text-[10px] text-slate-400">needs resume setup</span>
              </div>
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                  Active Backlogs
                </span>
                <div className="mt-1 text-xl font-black text-red-600">
                  {masterStudents.filter((s) => s.backlogs > 0).length}
                </div>
                <span className="text-[10px] text-slate-400">students with &gt; 0</span>
              </div>
            </div>

            {/* Master Records Table Section */}
            <div className="panel overflow-hidden border border-slate-200 bg-white">
              {/* Table Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Official Student Roster
                  </h4>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {filteredMasterStudents.length} records
                  </span>
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name, reg number, branch…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-navy"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Registration No</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Official CGPA</th>
                      <th className="px-4 py-3">Backlogs</th>
                      <th className="px-4 py-3">Passing Year</th>
                      <th className="px-4 py-3">Profile Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredMasterStudents.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {s.registration_number}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{s.name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                            {s.branch}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{s.cgpa}</td>
                        <td className="px-4 py-3">
                          {s.backlogs > 0 ? (
                            <span className="font-bold text-red-600">
                              {s.backlogs} backlog{s.backlogs > 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.passing_year}</td>
                        <td className="px-4 py-3">
                          {s.has_profile ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 size={11} /> Profile Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              Pending Setup
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredMasterStudents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          No student records found matching this search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: HISTORICAL PLACEMENT ARCHIVES */}
        {activeTab === "historical_placements" && (
          <section className="space-y-4">
            {/* Historical Upload Banner */}
            <div className="panel p-5 bg-gradient-to-r from-slate-900 via-navy to-slate-900 text-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                      Institutional Benchmarking
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-lg font-black text-white flex items-center gap-2">
                    <History size={20} className="text-amber-400" />
                    Upload Historical Placement Records (Past Years)
                  </h3>
                  <p className="mt-1 text-xs text-slate-300 max-w-2xl leading-relaxed">
                    Import placement data from previous academic batches (2022, 2023, 2024, 2025).
                    This unlocks automated multi-year placement rate tracking, package progression
                    trends, and company loyalty analytics.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={downloadHistoricalSample}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 transition"
                  >
                    <Download size={14} /> Download Sample CSV
                  </button>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 shadow-lg hover:bg-amber-300 transition">
                    <UploadCloud size={16} />
                    {uploading ? "Importing…" : "Upload Historical CSV / Excel"}
                    <input
                      className="hidden"
                      type="file"
                      accept=".csv, .xlsx"
                      disabled={uploading}
                      onChange={(e) => handleHistoricalUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Historical Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Historical Records
                </span>
                <div className="mt-1 text-xl font-black text-slate-900">
                  {historicalRecords.length}
                </div>
                <span className="text-[10px] text-slate-400">company recruitment drives</span>
              </div>
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Total Students Placed
                </span>
                <div className="mt-1 text-xl font-black text-emerald-600">
                  {historyStats.totalPlaced}
                </div>
                <span className="text-[10px] text-slate-400">across past batches</span>
              </div>
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  Historic Highest CTC
                </span>
                <div className="mt-1 text-xl font-black text-blue-600">
                  ₹{historyStats.maxCtc} LPA
                </div>
                <span className="text-[10px] text-slate-400">peak package recorded</span>
              </div>
              <div className="panel p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Average CTC
                </span>
                <div className="mt-1 text-xl font-black text-purple-600">
                  ₹{historyStats.avgCtc} LPA
                </div>
                <span className="text-[10px] text-slate-400">
                  across {historyStats.distinctCompanies} companies
                </span>
              </div>
            </div>

            {/* Historical Records Table Section */}
            <div className="panel overflow-hidden border border-slate-200 bg-white">
              {/* Table Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 bg-slate-50/70">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Past Placement Archives
                  </h4>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {filteredHistoricalRecords.length} records
                  </span>

                  {/* Batch Year Filter Pill */}
                  {historicalYears.length > 0 && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBatchFilter("all")}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                          selectedBatchFilter === "all"
                            ? "bg-navy text-white"
                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        All Batches
                      </button>
                      {historicalYears.map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setSelectedBatchFilter(yr)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                            selectedBatchFilter === yr
                              ? "bg-navy text-white"
                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {yr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search company, role, branch…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-navy"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Batch Year</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Package (CTC)</th>
                      <th className="px-4 py-3">Offers / Placed</th>
                      <th className="px-4 py-3">Eligible Branch</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredHistoricalRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3 font-bold text-navy">{r.batch_year}</td>
                        <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400" />
                          {r.company}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.role}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700">₹{r.ctc} LPA</td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 font-bold text-blue-700 border border-blue-100">
                            {r.students_placed} placed
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.branch}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteHistorical(r.id)}
                            className="text-slate-400 hover:text-red-600 transition p-1"
                            title="Delete entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredHistoricalRecords.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          {historicalRecords.length === 0
                            ? "No historical placement archives imported yet. Upload past year records above to unlock multi-year placement charts."
                            : "No records found matching this filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
