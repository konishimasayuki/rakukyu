import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { COMPANIES, DEFAULT_SETTINGS } from "./utils/constants";
import { INITIAL_EMPLOYEES, INITIAL_ATTENDANCE, INITIAL_BONUS } from "./utils/initialData";
import { calcPayroll } from "./utils/calcPayroll";
import { printPayslip, printLedger, printGensenhyou, printGensenchousho } from "./utils/printPDF";
import S from "./utils/styles";
import MobileCSS from "./tabs/MobileCSS";
import LoginScreen from "./tabs/LoginScreen";
import Dashboard from "./tabs/Dashboard";
import { EmployeeList, EmployeeModal } from "./tabs/Employees";
import AttendanceTab from "./tabs/Attendance";
import PayrollCalc from "./tabs/PayrollCalc";
import PayslipView from "./tabs/PayslipView";
import BonusCalc from "./tabs/BonusCalc";
import BonusSlip from "./tabs/BonusSlip";
import LedgerView from "./tabs/Ledger";
import WithholdingTax from "./tabs/Withholding";
import YearEndAdj from "./tabs/YearEndAdj";
import SettingsTab from "./tabs/Settings";

export default function PayrollApp() {
  const [company,       setCompany]       = useState(null);
  const [loginId,       setLoginId]       = useState("");
  const [loginPw,       setLoginPw]       = useState("");
  const [loginError,    setLoginError]    = useState("");
  const [tab,           setTab]           = useState("dashboard");
  const [employees,     setEmployees]     = useState(INITIAL_EMPLOYEES);
  const [settings,      setSettings]      = useState(DEFAULT_SETTINGS);
  const [monthlyIncentives, setMonthlyIncentives] = useState({
        "2024-06":{ 
      1:{inc_1:85000,inc_2:10000}, 
      2:{inc_3:15000,inc_4:30000}, 
      3:{inc_2:10000}, 
      4:{inc_1:120000,inc_5:20000},
      5:{inc_1:150000,inc_4:30000},
      6:{inc_1:60000,inc_2:10000},
      7:{inc_3:15000},
      8:{inc_3:15000,inc_4:25000},
      9:{inc_3:15000,inc_5:10000},
      11:{inc_1:95000,inc_2:10000},
      12:{inc_3:15000},
      13:{inc_3:15000},
      16:{inc_1:70000,inc_2:10000},
      17:{inc_3:15000,inc_5:10000},
      18:{inc_2:10000},
      19:{inc_1:40000},
      20:{inc_2:10000,inc_3:15000},
    }
  });
  const [attendanceData, setAttendanceData] = useState(INITIAL_ATTENDANCE);
  const [yearEndData,    setYearEndData]    = useState({});  // { empId: { declarations... } }
  const [monthTransport, setMonthTransport] = useState({});   // { empId: amount } 月次通勤手当上書き
  // bonusData: { "2024-06": { payDate:"2024-06-10", data:{ 1:{bonus:300000}, ... } } }
  const [bonusData, setBonusData] = useState(INITIAL_BONUS);
  const getBonus  = (m) => bonusData[m]||{payDate:"",data:{}};
  const setBonus  = (m, empId, val) => setBonusData(prev=>({...prev,[m]:{...prev[m],data:{...(prev[m]?.data||{}),[empId]:{bonus:val}}}}));
  const setBonusPayDate = (m, date) => setBonusData(prev=>({...prev,[m]:{...(prev[m]||{data:{}}),payDate:date}}));
  const [selectedMonth, setSelectedMonth] = useState("2024-06");
  const [editingEmp,    setEditingEmp]    = useState(null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [searchText,    setSearchText]    = useState("");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);

  // ============================================================
  // タブ切り替え・画面フォーカス時の再取得（本番: ここでAPIをコール）
  // ============================================================
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [refreshing,  setRefreshing]  = useState(false);
  const refreshCount = useRef(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    refreshCount.current += 1;
    // ★ 本番実装時はここでAPIからデータを再取得する
    // 例: const data = await fetch(`/api/company/${company?.id}/data`).then(r=>r.json());
    //     setEmployees(data.employees);
    //     setAttendanceData(data.attendance);
    //     setMonthlyIncentives(data.incentives);
    //     setBonusData(data.bonus);
    //     setYearEndData(data.yearEnd);
    // デモではstateはそのまま、タイムスタンプだけ更新
    setLastRefresh(Date.now());
    setTimeout(()=>setRefreshing(false), 400);
  }, [company]);

  // visibilitychange: 別タブから戻ってきたとき
  useEffect(()=>{
    const onVisible = () => { if (document.visibilityState==="visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return ()=>document.removeEventListener("visibilitychange", onVisible);
  },[refresh]);

  // windowフォーカス: 別ウィンドウから戻ってきたとき
  useEffect(()=>{
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return ()=>window.removeEventListener("focus", onFocus);
  },[refresh]);

  // ポーリング: 30秒ごとに自動更新（複数人入力を想定）
  useEffect(()=>{
    if (!company) return;
    const timer = setInterval(()=>refresh(), 30000);
    return ()=>clearInterval(timer);
  },[company, refresh]);

  const handleLogin = () => {
    const co = COMPANIES[loginId];
    if (co && co.password===loginPw) {
      setCompany(co);
      setSettings(s=>({ ...s, companyName:co.name, companyAddress:co.address, companyTel:co.tel }));
      setLoginError("");
    } else setLoginError("IDまたはパスワードが正しくありません");
  };

  const getMI   = (m) => monthlyIncentives[m]||{};
  const setMI   = (m,empId,masterId,amount) => setMonthlyIncentives(prev=>({ ...prev,[m]:{ ...prev[m],[empId]:{ ...(prev[m]?.[empId]||{}),[masterId]:amount } } }));
  const getAtt  = (m) => attendanceData[m]||{};
  const setAtt  = (m,empId,field,val) => setAttendanceData(prev=>({ ...prev,[m]:{ ...prev[m],[empId]:{ ...(prev[m]?.[empId]||{}),[field]:val } } }));

  const filteredEmployees = useMemo(()=>
    employees.filter(e=>e.name.includes(searchText)||e.department.includes(searchText)||e.nameKana.includes(searchText)),
    [employees,searchText]);

  const dashStats = useMemo(()=>{
    const mi=getMI(selectedMonth); const att=getAtt(selectedMonth);
    return employees.reduce((a,e)=>{
      const p=calcPayroll(e,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id]);
      return { gross:a.gross+p.grossSalary, net:a.net+p.netSalary, incentive:a.incentive+p.incentiveTotal };
    },{gross:0,net:0,incentive:0});
  },[employees,selectedMonth,settings,monthlyIncentives,attendanceData]);

  if (!company) return <LoginScreen loginId={loginId} setLoginId={setLoginId} loginPw={loginPw} setLoginPw={setLoginPw} loginError={loginError} onLogin={handleLogin}/>;

  const cp = { employees, settings, setSettings, monthlyIncentives, getMI, setMI, attendanceData, getAtt, setAtt, yearEndData, setYearEndData, selectedMonth, setSelectedMonth, company, monthTransport, setMonthTransport, bonusData, getBonus, setBonus, setBonusPayDate };

  const TABS = [
    { id:"dashboard",  icon:"▪", label:"ダッシュボード" },
    { id:"employees",  icon:"👥", label:"従業員管理" },
    { id:"attendance", icon:"📅", label:"勤怠入力" },
    { id:"payroll",    icon:"💴", label:"給与計算" },
    { id:"ledger",     icon:"📋", label:"賃金台帳" },
    { id:"payslip",    icon:"📄", label:"給与明細" },
    { id:"bonus",      icon:"🎁", label:"賞与計算" },
    { id:"bonusslip",  icon:"📑", label:"賞与明細" },
    { id:"withholding",icon:"🏛", label:"源泉管理" },
    { id:"yearend",    icon:"📝", label:"年末調整" },
    { id:"settings",   icon:"⚙", label:"設定" },
  ];

  const selectTab = (id) => { setTab(id); setSidebarOpen(false); refresh(); };

  return (
    <div style={S.root}>
      <MobileCSS/>
      {/* モバイル オーバーレイ */}
      {sidebarOpen && <div className="rakukyu-overlay" style={S.mobileOverlay} onClick={()=>setSidebarOpen(false)}/>}

      {/* サイドバー */}
      <aside className={`rakukyu-sidebar${sidebarOpen?" open":""}`} style={S.sidebar}>
                <div style={S.sidebarLogo}>
          <div style={S.logoMark}>楽</div>
          <div><div style={S.logoTitle}>楽給.com</div><div style={S.logoSub}>給与計算システム</div></div>
        </div>
        <div style={S.companyBadge}>{settings.companyName}</div>
        {TABS.map(t=>(
          <button key={t.id} style={{...S.navBtn,...(tab===t.id?S.navBtnActive:{})}} onClick={()=>selectTab(t.id)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
        <div style={{flex:1}}/>
        {/* 更新ステータス */}
        <div style={{padding:"6px 12px",marginBottom:4,borderRadius:6,background:"#ffffff08",display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:refreshing?"#f7b731":"#00c9a7",flexShrink:0,
            boxShadow:refreshing?"0 0 6px #f7b731":"0 0 6px #00c9a7"}}/>
          <div>
            <div style={{fontSize:9,color:"#888"}}>最終更新</div>
            <div style={{fontSize:10,color:"#aaa"}}>{new Date(lastRefresh).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
          </div>
          <button style={{marginLeft:"auto",background:"none",border:"1px solid #333",borderRadius:4,color:"#aaa",fontSize:10,cursor:"pointer",padding:"2px 6px"}} onClick={refresh}>
            {refreshing?"⟳":"↻"}
          </button>
        </div>
        <button style={S.logoutBtn} onClick={()=>{setCompany(null);setLoginId("");setLoginPw("");}}>ログアウト</button>
      </aside>

      {/* メインコンテンツ */}
      <div className="rakukyu-main-wrap" style={S.mainWrap}>
        {/* モバイル ヘッダー */}
        <div className="rakukyu-mobile-header" style={S.mobileHeader}>
          <button style={S.hamburger} onClick={()=>setSidebarOpen(o=>!o)}>
            <span style={S.hamLine}/><span style={S.hamLine}/><span style={S.hamLine}/>
          </button>
          <span style={S.mobileTitle}>楽給.com</span>
          <span style={S.mobileTabLabel}>{TABS.find(t=>t.id===tab)?.label}</span>
          {refreshing&&<span style={{fontSize:10,color:"#00c9a7",marginLeft:"auto"}}>更新中...</span>}
        </div>

        <main style={S.main}>
          {tab==="dashboard"  && <Dashboard  stats={dashStats} {...cp}/>}
          {tab==="employees"  && <EmployeeList employees={employees} searchText={searchText} setSearchText={setSearchText} onEdit={setEditingEmp} onAdd={()=>setShowAddModal(true)} onDelete={id=>setEmployees(prev=>prev.filter(e=>e.id!==id))} settings={settings}/>}
          {tab==="attendance" && <AttendanceTab {...cp}/>}
          {tab==="payroll"    && <PayrollCalc  {...cp}/>}
          {tab==="payslip"    && <PayslipView  {...cp} onPrint={printPayslip}/>}
          {tab==="bonus"      && <BonusCalc    {...cp}/>}
          {tab==="bonusslip"  && <BonusSlip    {...cp}/>}
          {tab==="ledger"     && <LedgerView   {...cp} getBonus={getBonus} onPrint={printLedger}/> }
          {tab==="withholding"&& <WithholdingTax {...cp}/>}
          {tab==="yearend"    && <YearEndAdj   {...cp} getBonus={getBonus} employees={employees}/> }
          {tab==="settings"   && <SettingsTab  {...cp} setEmployees={setEmployees}/>}
        </main>
      </div>

      {editingEmp  && <EmployeeModal emp={editingEmp}  settings={settings} onSave={u=>{setEmployees(prev=>prev.map(e=>e.id===u.id?u:e));setEditingEmp(null);}}  onClose={()=>setEditingEmp(null)}/>}
      {showAddModal && <EmployeeModal emp={null} settings={settings} onSave={n=>{setEmployees(prev=>[...prev,{...n,id:Date.now()}]);setShowAddModal(false);}} onClose={()=>setShowAddModal(false)}/>}
    </div>
  );
}


// ============================================================
// 源泉徴収票 PDF（給与＋賞与を1枚に）
// ============================================================
