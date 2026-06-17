import { useState, useEffect } from "react";
import { 
  Clock, 
  Calendar, 
  Copy, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Settings,
  Coffee,
  Bookmark,
  Sun,
  Moon,
  RefreshCw,
  X,
  ExternalLink,
  User
} from "lucide-react";

interface Row {
  day: string;
  status: string;
  start: string;
  end: string;
  halfLeave: boolean;
}

const STORAGE_KEY = "hybrid-work-calculator-v4";
const DAYS = ["월", "화", "수", "목", "금"];
const STATUSES = ["✅ 실적", "📌 고정", "⚡ 예측", "🏖️ 연차", "🎌 휴일"];

// Helper functions for time conversion
const toSec = (hhmm: string | null | undefined): number | null => {
  if (!hhmm) return null;
  const parts = hhmm.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return parts[0] * 3600 + parts[1] * 60;
};

const secToHMS = (sec: number): string => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const secToHM = (sec: number): string => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const adjustTime = (value: string | undefined, delta: number): string => {
  const s = toSec(value || "09:00") ?? 32400;
  const next = (s + delta * 60 + 86400) % 86400;
  return secToHM(next);
};

const isAm = (hhmm: string | undefined): boolean => {
  const s = toSec(hhmm || "09:00");
  if (s == null) return true;
  const hours = Math.floor(s / 3600);
  return hours < 12;
};

const toggleAmPm = (hhmm: string | undefined): string => {
  const s = toSec(hhmm || "09:00") ?? 32400;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  
  let newHours = hours;
  if (hours < 12) {
    newHours = hours + 12;
  } else {
    newHours = hours - 12;
  }
  
  return `${String(newHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export default function App() {
  // --- State Initialization ---
  const [rows, setRows] = useState<Row[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 5) {
          return parsed.map(r => ({
            day: r.day,
            status: r.status,
            start: r.start,
            end: r.end,
            halfLeave: !!r.halfLeave
          }));
        }
      }
    } catch (e) {
      console.error("Failed to parse rows from localStorage", e);
    }
    return DAYS.map((d, i) => ({
      day: d,
      status: i >= 3 ? "⚡ 예측" : "📌 고정",
      start: "09:00",
      end: "",
      halfLeave: false
    }));
  });

  const [targetHours, setTargetHours] = useState<number>(() => {
    const v = localStorage.getItem(`${STORAGE_KEY}:targetHours`);
    return v ? Number(v) : 40;
  });

  const [breakHours, setBreakHours] = useState<number>(() => {
    const v = localStorage.getItem(`${STORAGE_KEY}:breakHours`);
    return v ? Number(v) : 1.0; // 1 hour by default
  });

  const [bulkStartTime, setBulkStartTime] = useState(() => 
    localStorage.getItem(`${STORAGE_KEY}:bulkStartTime`) || "09:00"
  );
  const [bulkEndTime, setBulkEndTime] = useState(() => 
    localStorage.getItem(`${STORAGE_KEY}:bulkEndTime`) || "18:00"
  );
  
  const [selectedRow, setSelectedRow] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);
  const [syncData, setSyncData] = useState<any>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
  const [checkedStartDays, setCheckedStartDays] = useState<boolean[]>([false, false, false, false, false]);
  const [checkedEndDays, setCheckedEndDays] = useState<boolean[]>([false, false, false, false, false]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [predictMode, setPredictMode] = useState<"sameWorkTime" | "sameClockOut">(() => {
    const v = localStorage.getItem(`${STORAGE_KEY}:predictMode`);
    return (v === "sameClockOut") ? "sameClockOut" : "sameWorkTime";
  });

  // --- Sync predictMode to localStorage ---
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:predictMode`, predictMode);
  }, [predictMode]);

  // --- Initialize check state based on clockInTime/clockOutTime/holiday existence ---
  useEffect(() => {
    if (syncData && syncData.weekList && syncData.weekList[selectedWeekIdx]) {
      const week = syncData.weekList[selectedWeekIdx];
      const DAYS_ENG = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      
      const newCheckedStart = DAYS_ENG.map(engDay => {
        const dayItem = week.dailyList?.find((d: any) => d.detailDay && d.detailDay.dayOfWeek === engDay);
        return !!(dayItem && (dayItem.clockInTime || dayItem.detailDay?.holiDay || dayItem.holiDay === true));
      });
      
      const newCheckedEnd = DAYS_ENG.map(engDay => {
        const dayItem = week.dailyList?.find((d: any) => d.detailDay && d.detailDay.dayOfWeek === engDay);
        return !!(dayItem && (dayItem.clockOutTime || dayItem.detailDay?.holiDay || dayItem.holiDay === true));
      });
      
      setCheckedStartDays(newCheckedStart);
      setCheckedEndDays(newCheckedEnd);
    }
  }, [syncData, selectedWeekIdx]);

  // --- Load Suresoft Attendance from Chrome Storage & listen to changes ---
  useEffect(() => {
    const chromeObj = (window as any).chrome;
    if (!chromeObj || !chromeObj.storage || !chromeObj.storage.local) return;

    const loadData = () => {
      chromeObj.storage.local.get(["suresoft_attendance_data"], (result: any) => {
        if (result && result.suresoft_attendance_data) {
          const data = result.suresoft_attendance_data;
          setSyncData(data);
          
          if (data.standardDay && data.weekList) {
            const idx = data.weekList.findIndex((w: any) => {
              return data.standardDay >= w.firstDay && data.standardDay <= w.lastDay;
            });
            if (idx !== -1) {
              setSelectedWeekIdx(idx);
            }
          }
        }
      });
    };

    // Initial load
    loadData();

    // Listen for storage changes from background or other tabs
    const handleStorageChange = (changes: any, areaName: string) => {
      if (areaName === "local" && changes.suresoft_attendance_data) {
        const data = changes.suresoft_attendance_data.newValue;
        if (data) {
          setSyncData(data);
          if (data.standardDay && data.weekList) {
            const idx = data.weekList.findIndex((w: any) => {
              return data.standardDay >= w.firstDay && data.standardDay <= w.lastDay;
            });
            if (idx !== -1) {
              setSelectedWeekIdx(idx);
            }
          }
        }
      }
    };

    chromeObj.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chromeObj.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // --- Reload storage data whenever sync modal is opened ---
  useEffect(() => {
    if (showSyncModal) {
      const chromeObj = (window as any).chrome;
      if (chromeObj && chromeObj.storage && chromeObj.storage.local) {
        chromeObj.storage.local.get(["suresoft_attendance_data"], (result: any) => {
          if (result && result.suresoft_attendance_data) {
            const data = result.suresoft_attendance_data;
            setSyncData(data);
          }
        });
      }
    }
  }, [showSyncModal]);

  // --- Background Direct Sync fetch ---
  const handleBackgroundSync = () => {
    const chromeObj = (window as any).chrome;
    if (!chromeObj || !chromeObj.storage || !chromeObj.storage.local) {
      alert("크롬 확장 프로그램 환경이 아닙니다.");
      return;
    }

    setIsSyncing(true);
    chromeObj.storage.local.get(["suresoft_attendance_url"], (result: any) => {
      const url = result?.suresoft_attendance_url;
      if (!url) {
        setIsSyncing(false);
        alert("저장된 근태 API 주소가 없습니다. 최초 1회는 [근태 페이지 열기] 버튼을 눌러 사내 근태 페이지에 로그인/접속하여 데이터를 동기화해 주세요.");
        return;
      }

      // 백그라운드 fetch 수행 (credentials: 'include' 로 로그인 세션 쿠키 전달)
      fetch(url, { credentials: "include" })
        .then((res) => {
          const contentType = res.headers.get("content-type");
          if (!res.ok || (contentType && !contentType.includes("application/json"))) {
            throw new Error("세션이 만료되었거나 올바르지 않은 응답입니다.");
          }
          return res.json();
        })
        .then((data) => {
          if (data && data.weekList) {
            chromeObj.storage.local.set({ "suresoft_attendance_data": data }, () => {
              setSyncData(data);
              setIsSyncing(false);
              alert("근태 데이터가 성공적으로 갱신되었습니다!");
            });
          } else {
            throw new Error("유효한 근태 데이터 구조가 아닙니다.");
          }
        })
        .catch((err) => {
          console.error("Background sync failed:", err);
          setIsSyncing(false);
          if (confirm("로그인 세션이 만료되었거나 서버 오류가 발생했습니다. 사내 포털 로그인 페이지를 열어 직접 갱신하시겠습니까?")) {
            window.open("https://gw.suresofttech.com/app/ehr", "_blank");
          }
        });
    });
  };

  // --- Attendance Parser Helper ---
  const mapWeekDataToRows = (week: any): Row[] => {
    if (!week || !week.dailyList) return [];
    
    const DAYS_ENG = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const DAYS_KOR = ["월", "화", "수", "목", "금"];
    
    return DAYS_KOR.map((korDay, index) => {
      const engDay = DAYS_ENG[index];
      const dayItem = week.dailyList.find((d: any) => d.detailDay && d.detailDay.dayOfWeek === engDay);
      if (!dayItem) {
        return {
          day: korDay,
          status: "⚡ 예측",
          start: "09:00",
          end: "",
          halfLeave: false
        };
      }
      
      const start = dayItem.clockInTime ? dayItem.clockInTime.substring(0, 5) : "09:00";
      const end = dayItem.clockOutTime ? dayItem.clockOutTime.substring(0, 5) : "";
      
      let status = "⚡ 예측";
      if ((dayItem.detailDay && dayItem.detailDay.holiDay) || dayItem.holiDay === true) {
        status = "🎌 휴일";
      } else if (dayItem.clockInTime && dayItem.clockOutTime) {
        status = "✅ 실적";
      } else if (dayItem.clockInTime) {
        status = "⚡ 예측";
      }
      
      return {
        day: korDay,
        status,
        start,
        end,
        halfLeave: false
      };
    });
  };

  // --- Sync to localStorage ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:targetHours`, String(targetHours));
  }, [targetHours]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:breakHours`, String(breakHours));
  }, [breakHours]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:bulkStartTime`, bulkStartTime);
  }, [bulkStartTime]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:bulkEndTime`, bulkEndTime);
  }, [bulkEndTime]);

  // --- Calculations ---
  const targetSec = targetHours * 3600;
  const breakSec = breakHours * 3600;
  const predictCount = rows.filter(r => r.status.includes("예측")).length;

  // 1. Calculate base credits for non-predictive rows
  const calcBase = rows.map(r => {
    if (r.status.includes("연차") || r.status.includes("휴일")) {
      return { credited: 8 * 3600 };
    }
    if (r.status.includes("예측")) {
      return { credited: 0 };
    }
    const s = toSec(r.start);
    const e = toSec(r.end);
    const leaveCredit = r.halfLeave ? 4 * 3600 : 0;
    if (s == null || e == null) return { credited: leaveCredit };
    
    const duration = e - s;
    // For halfLeave, only subtract break hours if work duration > 4 hours
    const currentBreakSec = r.halfLeave 
      ? (duration > 4 * 3600 ? breakSec : 0)
      : breakSec;
    return { credited: leaveCredit + Math.max(0, duration - currentBreakSec) };
  });

  let actual = 0;
  let fixed = 0;

  rows.forEach((r, i) => {
    if (r.status.includes("예측")) return;
    if (r.status.includes("실적")) {
      actual += calcBase[i].credited;
    } else {
      fixed += calcBase[i].credited;
    }
  });

  const remaining = Math.max(0, targetSec - actual - fixed);

  // Predictive calculations (water-filling algorithm)
  const predictIndices: number[] = [];
  rows.forEach((r, i) => {
    if (r.status.includes("예측")) predictIndices.push(i);
  });
  
  const predictRows = predictIndices.map(idx => rows[idx]);

  const calculatePredictiveWork = (remainingSec: number, pRows: Row[]): number[] => {
    const n = pRows.length;
    if (n === 0) return [];
    
    if (predictMode === "sameWorkTime") {
      const g = pRows.map(r => r.halfLeave ? 4 * 3600 : 0);
      const sortedG = [...g].sort((a, b) => a - b);
      
      let low = 0;
      let high = 24 * 3600 * 5; 
      for (let iter = 0; iter < 50; iter++) {
        const mid = (low + high) / 2;
        const sum = sortedG.reduce((acc, val) => acc + Math.max(val, mid), 0);
        if (sum < remainingSec) {
          low = mid;
        } else {
          high = mid;
        }
      }
      const w = (low + high) / 2;
      
      return pRows.map(r => {
        if (r.halfLeave) {
          return Math.max(0, w - 4 * 3600);
        } else {
          return w;
        }
      });
    } else {
      let low = 0;
      let high = 24 * 3600 * 5;
      
      const getSumForTOut = (tOut: number): number => {
        return pRows.reduce((sum, r) => {
          const s = toSec(r.start) ?? 32400;
          if (r.halfLeave) {
            const duration = tOut - s;
            const actualWork = duration > 4 * 3600 ? Math.max(0, duration - breakSec) : Math.max(0, duration);
            return sum + (4 * 3600 + actualWork);
          } else {
            const duration = tOut - s;
            return sum + Math.max(0, duration - breakSec);
          }
        }, 0);
      };
      
      for (let iter = 0; iter < 50; iter++) {
        const mid = (low + high) / 2;
        if (getSumForTOut(mid) < remainingSec) {
          low = mid;
        } else {
          high = mid;
        }
      }
      const targetTOutVal = (low + high) / 2;
      
      return pRows.map(r => {
        const s = toSec(r.start) ?? 32400;
        if (r.halfLeave) {
          const duration = targetTOutVal - s;
          const actualWork = duration > 4 * 3600 ? Math.max(0, duration - breakSec) : Math.max(0, duration);
          return actualWork;
        } else {
          const duration = targetTOutVal - s;
          return Math.max(0, duration - breakSec);
        }
      });
    }
  };

  const predictActualWorks = calculatePredictiveWork(remaining, predictRows);

  // Calculate targetTOut for same clock-out time mode
  let targetTOut = 0;
  if (predictCount > 0 && predictMode === "sameClockOut") {
    let low = 0;
    let high = 24 * 3600 * 5;
    const getSumForTOut = (tOut: number): number => {
      return predictRows.reduce((sum, r) => {
        const s = toSec(r.start) ?? 32400;
        if (r.halfLeave) {
          const duration = tOut - s;
          const actualWork = duration > 4 * 3600 ? Math.max(0, duration - breakSec) : Math.max(0, duration);
          return sum + (4 * 3600 + actualWork);
        } else {
          const duration = tOut - s;
          return sum + Math.max(0, duration - breakSec);
        }
      }, 0);
    };
    for (let iter = 0; iter < 50; iter++) {
      const mid = (low + high) / 2;
      if (getSumForTOut(mid) < remaining) {
        low = mid;
      } else {
        high = mid;
      }
    }
    targetTOut = (low + high) / 2;
  }
  
  // Calculate recommended display values
  let recommendNormal = 0;
  let recommendHalf = 0;
  if (predictCount > 0) {
    const g = predictRows.map(r => r.halfLeave ? 4 * 3600 : 0);
    const sortedG = [...g].sort((a, b) => a - b);
    let low = 0;
    let high = 24 * 3600 * 5; 
    for (let iter = 0; iter < 50; iter++) {
      const mid = (low + high) / 2;
      const sum = sortedG.reduce((acc, val) => acc + Math.max(val, mid), 0);
      if (sum < remaining) {
        low = mid;
      } else {
        high = mid;
      }
    }
    recommendNormal = (low + high) / 2;
    recommendHalf = Math.max(0, recommendNormal - 4 * 3600);
  }

  const progress = Math.min(1, (actual + fixed) / targetSec);

  // --- Actions ---
  const handleStatusChange = (idx: number, status: string) => {
    const newRows = [...rows];
    newRows[idx].status = status;
    // Reset end time if switching to Predict or Off states
    if (status.includes("예측") || status.includes("연차") || status.includes("휴일")) {
      newRows[idx].end = "";
    }
    // Turn off halfLeave automatically if switched to full-day leaves
    if (status.includes("연차") || status.includes("휴일")) {
      newRows[idx].halfLeave = false;
    }
    setRows(newRows);
  };

  const handleHalfLeaveChange = (idx: number, checked: boolean) => {
    const newRows = [...rows];
    newRows[idx].halfLeave = checked;
    setRows(newRows);
  };

  const handleTimeChange = (idx: number, key: "start" | "end", value: string) => {
    const newRows = [...rows];
    newRows[idx][key] = value;
    setRows(newRows);
  };

  const handleAdjustClick = (idx: number, key: "start" | "end", delta: number) => {
    const newRows = [...rows];
    newRows[idx][key] = adjustTime(newRows[idx][key], delta);
    setRows(newRows);
  };

  const handleAmPmToggle = (idx: number, key: "start" | "end") => {
    const newRows = [...rows];
    newRows[idx][key] = toggleAmPm(newRows[idx][key]);
    setRows(newRows);
  };

  const applyBulkStart = () => {
    const newRows = rows.map(r => {
      const isOff = r.status.includes("연차") || r.status.includes("휴일");
      return isOff ? r : { ...r, start: bulkStartTime };
    });
    setRows(newRows);
  };

  const applyBulkEnd = () => {
    const newRows = rows.map(r => {
      const isOffOrPredict = r.status.includes("예측") || r.status.includes("연차") || r.status.includes("휴일");
      return isOffOrPredict ? r : { ...r, end: bulkEndTime };
    });
    setRows(newRows);
  };

  const copyPreviousRow = () => {
    if (selectedRow <= 0) return;
    const newRows = [...rows];
    newRows[selectedRow] = {
      ...newRows[selectedRow],
      start: rows[selectedRow - 1].start,
      end: rows[selectedRow - 1].end,
      halfLeave: rows[selectedRow - 1].halfLeave
    };
    setRows(newRows);
  };

  const resetAll = () => {
    const defaultRows = DAYS.map((d, i) => ({
      day: d,
      status: i >= 3 ? "⚡ 예측" : "📌 고정",
      start: "09:00",
      end: "",
      halfLeave: false
    }));
    setRows(defaultRows);
  };

  // Bulk selector options
  const startOptions = [];
  for (let h = 6; h <= 12; h++) {
    for (let m = 0; m < 60; m += 5) {
      startOptions.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  const endOptions = [];
  for (let h = 15; h <= 23; h++) {
    for (let m = 0; m < 60; m += 5) {
      endOptions.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }

  // Predictive scenario text
  let scenarioText = "모든 요일의 근무 계획이 수립되었습니다.";
  if (predictCount > 0) {
    if (predictMode === "sameWorkTime") {
      const normalPredictDays = predictRows.filter(r => !r.halfLeave).map(r => r.day);
      const halfPredictDays = predictRows.filter(r => r.halfLeave).map(r => r.day);
      
      const parts = [];
      if (normalPredictDays.length > 0) {
        parts.push(`일반 예측일(${normalPredictDays.join(", ")})에는 매일 약 ${secToHMS(recommendNormal)} (${Math.round((recommendNormal / 3600) * 10) / 10}시간)`);
      }
      if (halfPredictDays.length > 0) {
        parts.push(`반차 예측일(${halfPredictDays.join(", ")})에는 매일 약 ${secToHMS(recommendHalf)} (${Math.round((recommendHalf / 3600) * 10) / 10}시간)`);
      }
      scenarioText = `목표 달성을 위해 남은 예측일 동안 ${parts.join(", 이고 ")} 순근무가 필요합니다.`;
    } else {
      const predictDays = predictRows.map(r => r.day).join(", ");
      scenarioText = `목표 달성을 위해 남은 예측일(${predictDays}) 동안 모두 동일하게 [ ${secToHM(targetTOut)} ] 에 퇴근해야 합니다.`;
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in">
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/35 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-200/30 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Header section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-600 text-white text-xs font-semibold px-2 py-1 rounded-full uppercase tracking-wider">v2.0</span>
            <span className="text-slate-400 text-xs">Work Planner</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 bg-clip-text text-transparent">
            유연근무 계산기
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            실적, 고정 계획, 권장 예측 근무 시간을 스마트하게 자동 매핑합니다.
          </p>
        </div>
        
        {/* Sync and Settings buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowSyncModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${syncData ? "bg-emerald-400" : "bg-amber-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${syncData ? "bg-emerald-500" : "bg-amber-500"}`}></span>
            </span>
            근태 데이터 연동 {syncData ? "(완료)" : ""}
          </button>
          
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              showSettings 
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Settings className={`w-4 h-4 ${showSettings ? "rotate-45" : ""} transition-transform duration-300`} />
            설정 변경
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm transition-all animate-slide-down">
          <h3 className="font-semibold text-slate-800 text-base mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-600" />
            기준 정책 설정
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                주간 목표 근무 시간 (시간)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="1" 
                  max="120"
                  value={targetHours}
                  onChange={(e) => setTargetHours(Math.max(1, Number(e.target.value)))}
                  className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-indigo-600"
                />
                <span className="text-slate-500 text-sm">시간 (현재: {targetHours}시간 / {secToHMS(targetSec)})</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                하루 기준 휴게 시간 (시간)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0" 
                  max="4" 
                  step="0.5"
                  value={breakHours}
                  onChange={(e) => setBreakHours(Math.max(0, Number(e.target.value)))}
                  className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-indigo-600"
                />
                <span className="text-slate-500 text-sm">시간 (현재: {breakHours}시간 / 점심 등 {secToHMS(breakSec)} 차감)</span>
              </div>
            </div>
            
            <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                예측 근무 시간 배정 방식 (2일 이상 예측 시)
              </label>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer select-none">
                  <input 
                    type="radio" 
                    name="predictMode" 
                    value="sameWorkTime"
                    checked={predictMode === "sameWorkTime"}
                    onChange={() => setPredictMode("sameWorkTime")}
                    className="text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer"
                  />
                  동일한 순근무 시간 배정 우선
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer select-none">
                  <input 
                    type="radio" 
                    name="predictMode" 
                    value="sameClockOut"
                    checked={predictMode === "sameClockOut"}
                    onChange={() => setPredictMode("sameClockOut")}
                    className="text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer"
                  />
                  동일한 퇴근 시각 배정 우선 (출근 시간이 다를 때 권장)
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left/Middle: Table Section */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            {/* Table Header / Action controls */}
            <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-700 text-sm">주간 타임시트</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1">
                  <span className="text-xs text-slate-500 font-medium">출근 일괄</span>
                  <select 
                    value={bulkStartTime} 
                    onChange={(e) => setBulkStartTime(e.target.value)}
                    className="text-xs text-slate-800 font-semibold border-none focus:outline-none p-0 cursor-pointer"
                  >
                    {startOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button 
                    onClick={applyBulkStart}
                    className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors ml-1"
                    title="출근시간 일괄 적용"
                  >
                    적용
                  </button>
                </div>

                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1">
                  <span className="text-xs text-slate-500 font-medium">퇴근 일괄</span>
                  <select 
                    value={bulkEndTime} 
                    onChange={(e) => setBulkEndTime(e.target.value)}
                    className="text-xs text-slate-800 font-semibold border-none focus:outline-none p-0 cursor-pointer"
                  >
                    {endOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button 
                    onClick={applyBulkEnd}
                    className="text-indigo-600 hover:text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors ml-1"
                    title="퇴근시간 일괄 적용"
                  >
                    적용
                  </button>
                </div>

                <button 
                  onClick={copyPreviousRow}
                  disabled={selectedRow <= 0}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="바로 이전 요일의 출퇴근 시간을 복사해옵니다."
                >
                  <Copy className="w-3 h-3" />
                  윗행 복사
                </button>

                <button 
                  onClick={resetAll}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold hover:bg-rose-50 transition-all"
                  title="입력 상태를 초기 기본값으로 리셋합니다."
                >
                  <RotateCcw className="w-3 h-3" />
                  초기화
                </button>
              </div>
            </div>

            {/* Timetable wrapper */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/40 border-b border-slate-100">
                    <th className="pl-6 pr-2.5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12 whitespace-nowrap">요일</th>
                    <th className="px-2.5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-32 whitespace-nowrap">상태 설정</th>
                    <th className="px-2.5 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">출근 시간</th>
                    <th className="px-2.5 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">퇴근 시간</th>
                    <th className="px-2.5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-24 whitespace-nowrap">순근무</th>
                    <th className="pl-2.5 pr-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-28 whitespace-nowrap">최종 퇴근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, idx) => {
                    const isOff = r.status.includes("연차") || r.status.includes("휴일");
                    const isPredict = r.status.includes("예측");
                    const isActual = r.status.includes("실적");
                    const isFixed = r.status.includes("고정");
                    
                    let finalEnd = r.end;
                    let workSec = 0;

                    if (isPredict) {
                      const pIdx = predictIndices.indexOf(idx);
                      const actualWork = pIdx !== -1 ? predictActualWorks[pIdx] : 0;
                      workSec = (r.halfLeave ? 4 * 3600 : 0) + actualWork;
                      
                      const s = toSec(r.start);
                      if (s != null) {
                        const currentBreakSec = r.halfLeave 
                          ? (actualWork > 4 * 3600 ? breakSec : 0)
                          : breakSec;
                        finalEnd = secToHM(s + actualWork + currentBreakSec);
                      }
                    } else if (isOff) {
                      workSec = 8 * 3600;
                      finalEnd = "";
                    } else {
                      const s = toSec(r.start);
                      const e = toSec(r.end);
                      const leaveCredit = r.halfLeave ? 4 * 3600 : 0;
                      if (s != null && e != null) {
                        const duration = e - s;
                        const currentBreakSec = r.halfLeave 
                          ? (duration > 4 * 3600 ? breakSec : 0)
                          : breakSec;
                        workSec = leaveCredit + Math.max(0, duration - currentBreakSec);
                      } else {
                        workSec = leaveCredit;
                      }
                    }

                    // Row bg classes based on status and halfLeave
                    let rowBg = "bg-white";
                    if (isActual) rowBg = "bg-emerald-50/70 hover:bg-emerald-100/50";
                    else if (isFixed) rowBg = "bg-indigo-50/70 hover:bg-indigo-100/50";
                    else if (isPredict) rowBg = "bg-amber-50/60 hover:bg-amber-100/40";
                    else if (isOff) rowBg = "bg-rose-50/60 hover:bg-rose-100/40";

                    if (r.halfLeave && !isOff) {
                      rowBg = "bg-violet-50/70 hover:bg-violet-100/50";
                    }

                    return (
                      <tr key={r.day} className={`transition-colors ${rowBg}`}>
                        {/* Day indicator */}
                        <td className="pl-6 pr-2.5 py-3.5 font-bold text-slate-800 text-sm">
                          {r.day}
                        </td>

                        {/* Status Select & Half Leave Toggle */}
                        <td className="px-2.5 py-3.5">
                          <div className="flex flex-col gap-1.5 min-w-[110px]">
                            <select 
                              value={r.status}
                              onChange={(e) => handleStatusChange(idx, e.target.value)}
                              onFocus={() => setSelectedRow(idx)}
                              className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-indigo-500 cursor-pointer shadow-sm hover:border-slate-300"
                            >
                              {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                            </select>
                            
                            {!isOff && (
                              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 cursor-pointer select-none pl-1">
                                <input 
                                  type="checkbox" 
                                  checked={r.halfLeave}
                                  onChange={(e) => handleHalfLeaveChange(idx, e.target.checked)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 border-slate-300 cursor-pointer"
                                />
                                반차(4h)
                              </label>
                            )}
                          </div>
                        </td>

                        {/* Start Time Column */}
                        <td className="px-2.5 py-3.5">
                          <div className={`flex flex-col items-center gap-1.5 w-[148px] mx-auto ${isOff ? "opacity-35 pointer-events-none" : ""}`}>
                            <div className="flex items-center gap-1.5 w-full">
                              {!isOff ? (
                                <button 
                                  onClick={() => handleAmPmToggle(idx, "start")}
                                  className={`w-[30px] h-[30px] rounded-xl transition-all border cursor-pointer flex items-center justify-center flex-shrink-0 ${
                                    isAm(r.start) 
                                      ? "bg-amber-50 border-amber-200/50 hover:bg-amber-100 text-amber-500" 
                                      : "bg-indigo-50 border-indigo-200/50 hover:bg-indigo-100 text-indigo-500"
                                  }`}
                                  title={isAm(r.start) ? "오전 (클릭하여 오후로 전환)" : "오후 (클릭하여 오전으로 전환)"}
                                >
                                  {isAm(r.start) ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                                </button>
                              ) : (
                                <div className="w-[30px] h-[30px] flex-shrink-0" />
                              )}
                              <input 
                                type="time" 
                                value={r.start}
                                disabled={isOff}
                                onChange={(e) => handleTimeChange(idx, "start", e.target.value)}
                                onFocus={() => setSelectedRow(idx)}
                                className="px-2 py-1 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-indigo-500 shadow-sm text-center w-[112px] h-[30px]"
                              />
                            </div>
                            {!isOff && (
                              <div className="grid grid-cols-4 gap-1 w-full bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/50">
                                <button onClick={() => handleAdjustClick(idx, "start", -10)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">-10</button>
                                <button onClick={() => handleAdjustClick(idx, "start", -1)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">-1</button>
                                <button onClick={() => handleAdjustClick(idx, "start", 1)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">+1</button>
                                <button onClick={() => handleAdjustClick(idx, "start", 10)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">+10</button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* End Time Column */}
                        <td className="px-2.5 py-3.5">
                          <div className={`flex flex-col items-center gap-1.5 w-[148px] mx-auto ${isOff || isPredict ? "opacity-35 pointer-events-none" : ""}`}>
                            <div className="flex items-center gap-1.5 w-full">
                              {!isOff && !isPredict ? (
                                <button 
                                  onClick={() => handleAmPmToggle(idx, "end")}
                                  disabled={isOff || isPredict}
                                  className={`w-[30px] h-[30px] rounded-xl transition-all border cursor-pointer flex items-center justify-center flex-shrink-0 ${
                                    isAm(r.end) 
                                      ? "bg-amber-50 border-amber-200/50 hover:bg-amber-100 text-amber-500" 
                                      : "bg-indigo-50 border-indigo-200/50 hover:bg-indigo-100 text-indigo-500"
                                  }`}
                                  title={isAm(r.end) ? "오전 (클릭하여 오후로 전환)" : "오후 (클릭하여 오전으로 전환)"}
                                >
                                  {isAm(r.end) ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                                </button>
                              ) : (
                                <div className="w-[30px] h-[30px] flex-shrink-0" />
                              )}
                              <input 
                                type="time" 
                                value={r.end}
                                disabled={isOff || isPredict}
                                onChange={(e) => handleTimeChange(idx, "end", e.target.value)}
                                onFocus={() => setSelectedRow(idx)}
                                className="px-2 py-1 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-indigo-500 shadow-sm text-center w-[112px] h-[30px]"
                              />
                            </div>
                            {!isOff && !isPredict && (
                              <div className="grid grid-cols-4 gap-1 w-full bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/50">
                                <button onClick={() => handleAdjustClick(idx, "end", -10)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">-10</button>
                                <button onClick={() => handleAdjustClick(idx, "end", -1)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">-1</button>
                                <button onClick={() => handleAdjustClick(idx, "end", 1)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">+1</button>
                                <button onClick={() => handleAdjustClick(idx, "end", 10)} className="py-0.5 text-[9px] font-bold text-slate-500 hover:bg-white hover:text-slate-800 rounded transition-all text-center">+10</button>
                              </div>
                            )}
                            {isPredict && (
                              <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-1 rounded-md border border-amber-200/40 text-center w-full block">권장퇴근 자동산출</span>
                            )}
                          </div>
                        </td>

                        {/* Net Work Hour */}
                        <td className="px-2.5 py-3.5 font-mono text-sm md:text-base font-bold text-slate-700">
                          {secToHMS(workSec)}
                        </td>

                        {/* Final Recommendation End Time */}
                        <td className="pl-2.5 pr-6 py-3.5 font-mono text-sm md:text-base font-bold text-slate-800">
                          {finalEnd ? (
                            <span className={`flex items-center gap-1.5 ${isPredict ? "text-amber-600 font-extrabold" : "text-slate-900"}`}>
                              <Clock className="w-4 h-4 flex-shrink-0" />
                              {finalEnd}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Lunch and break policy hint */}
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
            <Coffee className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <p>
              요일별 순근무시간 산정 시, 일일 휴게시간(설정값: {breakHours}시간)이 자동으로 차감됩니다. 연차/휴일 처리 시에는 하루 8시간, 반차 처리 시에는 하루 4시간의 휴가 시간이 기본 합산 가산됩니다. (단, 반차인 날은 실제 근무 시간이 4시간을 초과하는 경우에만 휴게 시간이 차감됩니다.)
            </p>
          </div>
        </div>

        {/* Right: Dashboard Summary Section */}
        <div className="flex flex-col gap-6">
          
          {/* Main KPI Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-600" />
              대시보드 통계
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 text-sm">
                <span className="text-slate-500">주간 목표 근무</span>
                <span className="font-bold text-slate-800 font-mono">{secToHMS(targetSec)} ({targetHours}h)</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                  실적 합계
                </span>
                <span className="font-bold text-slate-800 font-mono">{secToHMS(actual)}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></span>
                  고정 계획 합계
                </span>
                <span className="font-bold text-slate-800 font-mono">{secToHMS(fixed)}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span>
                  예측 대상 일수
                </span>
                <span className="font-bold text-slate-800 font-mono">{predictCount} 일</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 text-sm">
                <span className="text-slate-500">남은 필요 근무</span>
                <span className="font-bold text-indigo-600 font-mono">{secToHMS(remaining)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-slate-800 font-semibold">
                  {predictMode === "sameWorkTime" ? "예측일 일일 권장 근무" : "예측일 권장 퇴근 시각"}
                </span>
                <div className="flex flex-col items-end">
                  {predictMode === "sameWorkTime" ? (
                    <>
                      <span className="font-extrabold text-indigo-700 font-mono text-base">{secToHMS(recommendNormal)}</span>
                      {predictRows.some(r => r.halfLeave) && (
                        <span className="text-[10px] text-violet-600 font-bold font-mono">(반차 예측일: {secToHMS(recommendHalf)})</span>
                      )}
                    </>
                  ) : (
                    <span className="font-extrabold text-indigo-700 font-mono text-base">{secToHM(targetTOut)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Circular/Linear Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">주간 진행률</span>
              <span className="text-xl font-black text-indigo-600 font-mono">{(progress * 100).toFixed(2)}%</span>
            </div>
            
            {/* Linear Progress Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner mb-4">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-emerald-500 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            {/* Sub text status */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>
                현재 실적 및 계획 합산 {Math.round(((actual + fixed) / 3600) * 10) / 10}시간 완료했습니다.
              </span>
            </div>
          </div>

          {/* AI Guide Scenario Card */}
          <div className="bg-gradient-to-br from-indigo-950 to-indigo-900 border border-indigo-800/30 rounded-2xl p-6 shadow-lg text-white relative overflow-hidden">
            {/* Overlay graphics */}
            <div className="absolute right-[-20%] bottom-[-20%] w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <h3 className="font-semibold text-indigo-200 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-indigo-400" />
              최종 근무 권장 시나리오
            </h3>
            <p className="text-sm font-medium leading-relaxed mb-4 text-indigo-50">
              {scenarioText}
            </p>
            
            <div className="bg-indigo-900/40 border border-indigo-700/30 rounded-xl p-3 text-xs text-indigo-200">
              <div className="flex items-center gap-1.5 mb-1 font-bold">
                <HelpCircle className="w-3.5 h-3.5" />
                사용법 팁
              </div>
              실제 근무한 날은 <span className="text-white font-bold">✅ 실적</span>으로 상태를 바꾸고 퇴근 시각을 정밀하게 기록하세요. 나머지 남은 요일들을 <span className="text-white font-bold">⚡ 예측</span> 상태로 두시면, 주 40시간(또는 설정 목표 시간)을 채우기 위해 오늘 언제 퇴근해야 하는지 실시간으로 권장 시간을 알 수 있습니다. 반차 사용 시 <span className="text-white font-bold">반차(4h)</span>를 선택하면 남은 권장 시간이 자동으로 차감 분배됩니다.
            </div>
          </div>

        </div>
      </div>

      {/* Suresoft Attendance Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white/95 border border-slate-200/50 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative glass-panel max-h-[90vh] overflow-y-auto animate-scale-up">
            <button 
              onClick={() => setShowSyncModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2.5 mb-2">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin-slow" />
              <h2 className="text-xl font-bold text-slate-800">사내 근태 데이터 연동</h2>
            </div>
            
            {syncData ? (
              <div className="space-y-5">
                {/* User Profile Info */}
                <div className="bg-indigo-50/50 border border-indigo-100/40 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                      {syncData.user?.name?.substring(0, 2) || <User className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{syncData.user?.fullName || "사원"}</h3>
                      <p className="text-xs text-slate-500">{syncData.user?.deptName || "부서 정보 없음"} • 기준일: {syncData.standardDay}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                      onClick={handleBackgroundSync}
                      disabled={isSyncing}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100/30 flex-shrink-0 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                      {isSyncing ? "갱신 중..." : "즉시 동기화"}
                    </button>
                    <a 
                      href="https://gw.suresofttech.com/app/ehr" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/50 rounded-xl text-xs font-bold transition-all flex-shrink-0 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      근태 페이지 열기
                    </a>
                  </div>
                </div>

                {/* Week Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">연동 주차 선택</label>
                  <select 
                    value={selectedWeekIdx}
                    onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
                    className="w-full text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-indigo-500 shadow-sm cursor-pointer hover:border-slate-300"
                  >
                    {syncData.weekList?.map((week: any, wIdx: number) => {
                      const isCurrent = week.firstDay <= syncData.standardDay && syncData.standardDay <= week.lastDay;
                      return (
                        <option key={wIdx} value={wIdx}>
                          {`${wIdx + 1}주차 (${week.firstDay} ~ ${week.lastDay}) ${isCurrent ? " [현재 주]" : ""}`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Mapped Preview Table */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">주간 근태 미리보기</span>
                    <span className="text-[11px] text-slate-500">Mon-Fri 매핑 결과</span>
                  </div>
                  <div className="border border-slate-200/60 rounded-xl overflow-hidden bg-slate-50/50 shadow-sm">
                    <div className="grid grid-cols-4 gap-2 p-3 bg-slate-100/60 font-bold text-xs text-slate-500 border-b border-slate-200/60">
                      <div>요일</div>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="checkbox"
                          checked={checkedStartDays.every(Boolean)}
                          onChange={(e) => {
                            setCheckedStartDays([e.target.checked, e.target.checked, e.target.checked, e.target.checked, e.target.checked]);
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer"
                        />
                        <span>출근 동기화</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="checkbox"
                          checked={checkedEndDays.every(Boolean)}
                          onChange={(e) => {
                            setCheckedEndDays([e.target.checked, e.target.checked, e.target.checked, e.target.checked, e.target.checked]);
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer"
                        />
                        <span>퇴근 동기화</span>
                      </div>
                      <div>상태</div>
                    </div>
                    {mapWeekDataToRows(syncData.weekList?.[selectedWeekIdx]).map((r, index) => {
                      const week = syncData.weekList[selectedWeekIdx];
                      const DAYS_ENG = ["Mon", "Tue", "Wed", "Thu", "Fri"];
                      const dayItem = week.dailyList?.find((d: any) => d.detailDay && d.detailDay.dayOfWeek === DAYS_ENG[index]);
                      const isHoliday = !!(dayItem && (dayItem.detailDay?.holiDay || dayItem.holiDay === true));
                      const hasClockIn = !!(dayItem && dayItem.clockInTime);
                      const hasClockOut = !!(dayItem && dayItem.clockOutTime);

                      return (
                        <div key={r.day} className="grid grid-cols-4 gap-2 p-3 border-b border-slate-100 text-xs items-center last:border-b-0">
                          <div className="font-bold text-slate-700">{r.day}요일</div>
                          
                          {isHoliday ? (
                            <div className="col-span-2 flex items-center gap-2">
                              <input 
                                type="checkbox"
                                checked={checkedStartDays[index] || false}
                                onChange={(e) => {
                                  const updatedStart = [...checkedStartDays];
                                  const updatedEnd = [...checkedEndDays];
                                  updatedStart[index] = e.target.checked;
                                  updatedEnd[index] = e.target.checked;
                                  setCheckedStartDays(updatedStart);
                                  setCheckedEndDays(updatedEnd);
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer"
                              />
                              <span className="text-rose-600 font-semibold">
                                🎌 공식 휴일 (출퇴근 기록 없음)
                              </span>
                            </div>
                          ) : (
                            <>
                              {/* 출근 시간 & 체크박스 */}
                              <div className="flex items-center gap-2">
                                <input 
                                  type="checkbox"
                                  checked={checkedStartDays[index] || false}
                                  disabled={!hasClockIn}
                                  onChange={(e) => {
                                    const updated = [...checkedStartDays];
                                    updated[index] = e.target.checked;
                                    setCheckedStartDays(updated);
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer disabled:opacity-40"
                                />
                                <span className={`font-mono font-medium ${hasClockIn ? "text-slate-700" : "text-slate-400"}`}>
                                  {hasClockIn ? r.start : "-"}
                                </span>
                              </div>

                              {/* 퇴근 시간 & 체크박스 */}
                              <div className="flex items-center gap-2">
                                <input 
                                  type="checkbox"
                                  checked={checkedEndDays[index] || false}
                                  disabled={!hasClockOut}
                                  onChange={(e) => {
                                    const updated = [...checkedEndDays];
                                    updated[index] = e.target.checked;
                                    setCheckedEndDays(updated);
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300 cursor-pointer disabled:opacity-40"
                                />
                                <span className={`font-mono font-medium ${hasClockOut ? "text-slate-700" : "text-slate-400"}`}>
                                  {hasClockOut ? r.end : "-"}
                                </span>
                              </div>
                            </>
                          )}

                          {/* 상태 배지 */}
                          <div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === "✅ 실적" 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/30" 
                                : r.status === "🎌 휴일"
                                ? "bg-rose-50 text-rose-700 border border-rose-200/30"
                                : "bg-amber-50 text-amber-700 border border-amber-200/30"
                            }`}>
                              {r.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Apply Button */}
                <button
                  onClick={() => {
                    const finalRows = mapWeekDataToRows(syncData.weekList[selectedWeekIdx]);
                    const mergedRows = rows.map((existingRow, index) => {
                      const syncRow = finalRows[index];
                      let newRow = { ...existingRow };

                      if (syncRow.status === "🎌 휴일") {
                        // 만약 휴일이라면, 출근 또는 퇴근 중 하나라도 체크되어 있을 때 휴일 상태를 연동합니다.
                        if (checkedStartDays[index] || checkedEndDays[index]) {
                          return syncRow;
                        }
                        return existingRow;
                      }

                      // 일반 근무일인 경우
                      if (checkedStartDays[index]) {
                        newRow.start = syncRow.start;
                      }
                      if (checkedEndDays[index]) {
                        newRow.end = syncRow.end;
                      }

                      // 상태 결정 로직:
                      // 만약 출퇴근이 둘 다 값이 채워져 있고, 둘 다 체크되어 동기화했다면 실적으로 변경
                      // 만약 출근만 동기화했고 퇴근은 동기화하지 않았다면 (또는 값이 없다면),
                      // 기존 상태를 유지하되 만약 기존 상태가 '실적'이었는데 퇴근 시간이 비어있게 된다면 '예측'으로 돌립니다.
                      const week = syncData.weekList[selectedWeekIdx];
                      const DAYS_ENG = ["Mon", "Tue", "Wed", "Thu", "Fri"];
                      const dayItem = week.dailyList?.find((d: any) => d.detailDay && d.detailDay.dayOfWeek === DAYS_ENG[index]);
                      const hasSyncStart = !!(dayItem && dayItem.clockInTime);
                      const hasSyncEnd = !!(dayItem && dayItem.clockOutTime);

                      const isStartSynced = checkedStartDays[index] && hasSyncStart;
                      const isEndSynced = checkedEndDays[index] && hasSyncEnd;

                      if (isStartSynced && isEndSynced) {
                        newRow.status = "✅ 실적";
                      } else {
                        // 만약 실제 퇴근시간이 없거나 동기화되지 않았다면 실적이 될 수 없음 (기존에 실적이었더라도 예측이나 고정으로 복구)
                        if (!newRow.end) {
                          newRow.status = existingRow.status === "✅ 실적" ? "⚡ 예측" : existingRow.status;
                        } else {
                          // 퇴근시간은 있는데 출근시간이 없다면 (이런 경우는 드물지만)
                          if (!newRow.start) {
                            newRow.status = "⚡ 예측";
                          } else {
                            // 출퇴근 시간이 둘 다 있지만, 둘 중 하나만 동기화된 상태라면 실적 상태를 유지하거나 고정 상태 유지
                            newRow.status = existingRow.status;
                          }
                        }
                      }

                      return newRow;
                    });
                    setRows(mergedRows);
                    setShowSyncModal(false);
                  }}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm font-semibold"
                >
                  계산기에 선택한 요일 데이터 적용하기
                </button>
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-500 border border-amber-100">
                  <RefreshCw className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">연동된 근태 데이터가 없습니다</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                    크롬 확장 프로그램을 사용 중이라면 사내 포털에 로그인하여 근태 화면을 조회해 주세요. 자동으로 데이터가 캡처됩니다.
                  </p>
                </div>
                <div className="flex justify-center gap-2">
                  <button 
                    onClick={handleBackgroundSync}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100/30 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "동기화 중..." : "즉시 동기화"}
                  </button>
                  <a 
                    href="https://gw.suresofttech.com/app/ehr" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-100/50 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    사내 근태관리 페이지 열기
                  </a>
                </div>
              </div>
            )}

            {/* Manual JSON Paste Fallback */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <details className="group">
                <summary className="text-[11px] text-slate-400 font-semibold cursor-pointer hover:text-slate-600 list-none flex items-center gap-1 select-none">
                  <span className="transition-transform group-open:rotate-90">▶</span>
                  <span>[고급] 수동으로 JSON 데이터 붙여넣기</span>
                </summary>
                <div className="mt-3 space-y-2">
                  <textarea
                    placeholder="F12 Network 탭의 Response JSON 데이터를 여기에 붙여넣으세요..."
                    rows={4}
                    className="w-full text-[11px] p-3 font-mono border border-slate-200 rounded-xl focus:outline-indigo-500 bg-slate-50/50"
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        if (parsed && parsed.weekList) {
                          setSyncData(parsed);
                          if (parsed.standardDay && parsed.weekList) {
                            const idx = parsed.weekList.findIndex((w: any) => {
                              return parsed.standardDay >= w.firstDay && parsed.standardDay <= w.lastDay;
                            });
                            if (idx !== -1) {
                              setSelectedWeekIdx(idx);
                            }
                          }
                        }
                      } catch (err) {}
                    }}
                  />
                  <p className="text-[10px] text-slate-400 leading-normal">
                    개발자 도구(F12)의 `month?baseDate=...` 응답 값을 붙여넣으면 확장 프로그램 없이도 동일하게 연동하여 사용할 수 있습니다.
                  </p>
                </div>
              </details>
            </div>

            {/* Extension Loading Guide */}
            <div className="mt-4 border-t border-slate-100 pt-4 bg-slate-50 p-4 rounded-xl border border-slate-200/40">
              <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                자동 연동 확장 프로그램 등록 방법
              </h4>
              <ol className="list-decimal list-inside text-[11px] text-slate-500 space-y-1.5 leading-relaxed">
                <li>크롬 브라우저에서 <code className="bg-slate-200/75 px-1 py-0.5 rounded font-mono text-slate-800 text-[10px]">chrome://extensions/</code> 주소로 이동합니다.</li>
                <li>우측 상단의 <strong>개발자 모드 (Developer mode)</strong> 스위치를 켭니다.</li>
                <li>좌측 상단의 <strong>압축해제된 확장 프로그램을 로드합니다 (Load unpacked)</strong>를 클릭합니다.</li>
                <li>프로젝트의 빌드 폴더인 <code className="bg-slate-200/75 px-1 py-0.5 rounded font-mono text-slate-800 text-[10px]">dist</code> 폴더를 선택하여 등록합니다.</li>
                <li>등록 후 사내 근태관리 사이트에 접속하면 데이터가 자동으로 동기화됩니다!</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
