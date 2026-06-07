import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
function Dashboard({ stats, employees, selectedMonth, setSelectedMonth, settings, getMI, getAtt }) {
  const byDept = useMemo(()=>{ const m={}; employees.forEach(e=>{m[e.department]=(m[e.department]||0)+1;}); return m; },[employees]);
  return (
    <div style={S.page}>
      <div style={S.pageHeader}><h2 style={S.pageTitle}>ダッシュボード</h2><MonthPicker value={selectedMonth} onChange={setSelectedMonth}/></div>
      <div style={S.statsGrid}>
        {[
          {label:"従業員数",       value:`${employees.length}名`, sub:"在籍中",    color:"#6c63ff"},
          {label:"総支給額",       value:`¥${fmt(stats.gross)}`,  sub:selectedMonth, color:"#00c9a7"},
          {label:"差引支給額合計", value:`¥${fmt(stats.net)}`,    sub:"手取り合計", color:"#f7b731"},
          {label:"インセンティブ計",value:`¥${fmt(stats.incentive)}`,sub:"今月の報酬",color:"#fc5c65"},
        ].map(s=>(
          <div key={s.label} style={{...S.statCard,borderTopColor:s.color}}>
            <div style={{...S.statValue,color:s.color}}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
            <div style={S.statSub}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={S.twoCol}>
        <div style={S.card}>
          <h3 style={S.cardTitle}>部署別人員</h3>
          {Object.entries(byDept).map(([dept,cnt])=>(
            <div key={dept} style={S.barRow}>
              <span style={S.barLabel}>{dept}</span>
              <div style={S.barTrack}><div style={{...S.barFill,width:`${(cnt/employees.length)*100}%`}}/></div>
              <span style={S.barCnt}>{cnt}名</span>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <h3 style={S.cardTitle}>給与規定</h3>
          {[
            ["締め日",      `毎月${settings.closingDay===99?"末日":settings.closingDay+"日"}`],
            ["源泉納付",    settings.withholdingPayType==="special"?"納期特例（半年）":"毎月納付（翌月10日）"],
            ["支払日",      `毎月${settings.paymentDay===99?"末日":settings.paymentDay+"日"}（${settings.paymentMonth==="same"?"当月":"翌月"}払い）`],
            ["所定労働日数",`${settings.workDaysPerMonth}日/月`],
            ["所定労働時間",`${settings.workHoursPerDay}時間/日`],
            ["普通残業",    `×${settings.overtimeRate}`],
            ["深夜残業",    `×${settings.lateNightRate}`],
            ["休日残業",    `×${settings.holidayRate}`],
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px dotted #eee",fontSize:13}}>
              <span style={{color:"#666"}}>{k}</span><span style={{fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ATTENDANCE TAB
// ============================================================

export default Dashboard;
