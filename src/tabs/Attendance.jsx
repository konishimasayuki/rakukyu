import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
function AttendanceTab({ employees, selectedMonth, setSelectedMonth, settings, getAtt, setAtt }) {
  const att = getAtt(selectedMonth);

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean);
      lines.slice(1).forEach(line => {
        const cols = line.split(",");
        // コードで検索、なければIDで検索
        const byCode = employees.find(e=>e.code && e.code===cols[0].trim());
        const empId = byCode ? byCode.id : Number(cols[1]);
        if (!empId) return;
        setAtt(selectedMonth, empId, "workDays",       Number(cols[2])||0);
        setAtt(selectedMonth, empId, "absentDays",     Number(cols[3])||0);
        setAtt(selectedMonth, empId, "paidLeaveDays",  Number(cols[4])||0);
        setAtt(selectedMonth, empId, "scheduledHours", Number(cols[5])||0);
        setAtt(selectedMonth, empId, "actualHours",    Number(cols[6])||0);
        setAtt(selectedMonth, empId, "overtime",       Number(cols[7])||0);
        setAtt(selectedMonth, empId, "lateNight",      Number(cols[8])||0);
        setAtt(selectedMonth, empId, "holiday",        Number(cols[9])||0);
      });
    };
    reader.readAsText(file);
    e.target.value="";
  };

  const downloadTemplate = () => {
    const header = "従業員コード,従業員ID,出勤日数,欠勤日数,有給日数,所定労働時間,実働時間,普通残業時間,深夜残業時間,休日残業時間";
    const rows = employees.map(e=>`${e.code||""},${e.id},${settings.workDaysPerMonth},0,0,${settings.workDaysPerMonth*settings.workHoursPerDay},${settings.workDaysPerMonth*settings.workHoursPerDay},0,0,0`);
    const csv = [header,...rows].join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `勤怠テンプレート_${selectedMonth}.csv`;
    a.click();
  };

  const FIELDS = [
    {key:"workDays",       label:"出勤日数",     unit:"日",  w:60},
    {key:"absentDays",     label:"欠勤日数",     unit:"日",  w:60},
    {key:"paidLeaveDays",  label:"有給日数",     unit:"日",  w:60},
    {key:"scheduledHours", label:"所定時間",     unit:"h",   w:60},
    {key:"actualHours",    label:"実働時間",     unit:"h",   w:60},
    {key:"overtime",       label:"普通残業",     unit:"h",   w:60},
    {key:"lateNight",      label:"深夜残業",     unit:"h",   w:60},
    {key:"holiday",        label:"休日残業",     unit:"h",   w:60},
  ];

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>勤怠入力</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
          <button style={S.secondaryBtn} onClick={downloadTemplate}>⬇ CSVテンプレート</button>
          <label style={{...S.primaryBtn,cursor:"pointer"}}>
            ⬆ CSVインポート
            <input type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV}/>
          </label>
        </div>
      </div>

      <div style={{marginBottom:12,padding:"8px 14px",background:"#f0edff",borderRadius:8,fontSize:12,color:"#6c63ff"}}>
        💡 所定労働日数: <b>{settings.workDaysPerMonth}日</b>　1日所定時間: <b>{settings.workHoursPerDay}h</b>　
        普通残業: <b>×{settings.overtimeRate}</b>　深夜: <b>×{settings.lateNightRate}</b>　休日: <b>×{settings.holidayRate}</b>
        　<span style={{color:"#aaa"}}>※設定タブで変更可</span>
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{...S.th,minWidth:100}}>従業員</th>
              <th style={{...S.th,fontSize:10}}>雇用形態</th>
              {FIELDS.map(f=><th key={f.key} style={{...S.th,fontSize:10,minWidth:72}}>{f.label}<br/><span style={{opacity:0.6}}>{f.unit}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {employees.map(e=>{
              const a = att[e.id]||{};
              const isPT = e.employmentType==="パート"||e.employmentType==="アルバイト";
              return (
                <tr key={e.id} style={S.tr}>
                  <td style={{...S.td,fontWeight:600}}>{e.name}<br/><span style={{fontSize:10,color:"#888"}}>{e.department}</span></td>
                  <td style={S.td}><span style={S.typeBadge}>{e.employmentType}</span></td>
                  {FIELDS.map(f=>{
                    const disabled = isPT && ["overtime","lateNight","holiday"].includes(f.key);
                    return (
                      <td key={f.key} style={{...S.td,padding:"6px 4px"}}>
                        <input
                          style={{...S.formInput,width:f.w,padding:"4px 6px",fontSize:12,textAlign:"center",background:disabled?"#f8f8f8":"white",color:disabled?"#bbb":"#333"}}
                          type="number" step="0.5" min="0"
                          disabled={disabled}
                          value={a[f.key]??""}
                          placeholder="0"
                          onChange={ev=>setAtt(selectedMonth,e.id,f.key,Number(ev.target.value))}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// EMPLOYEE LIST
// ============================================================

export default AttendanceTab;
