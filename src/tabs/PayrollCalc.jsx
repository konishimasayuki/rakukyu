import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
function PayrollCalc({ employees, settings, getMI, setMI, getAtt, selectedMonth, setSelectedMonth, monthTransport, setMonthTransport }) {
  const [incOpen, setIncOpen] = useState(false);
  const mi = getMI(selectedMonth);
  const att = getAtt(selectedMonth);
  const rows = useMemo(()=>employees.map(e=>{
    const empWithTransport = monthTransport[e.id]!==undefined ? {...e,transportAllowance:monthTransport[e.id]} : e;
    return {emp:e,p:calcPayroll(empWithTransport,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id])};
  }),[employees,selectedMonth,settings,mi,att,monthTransport]);
  const totals = useMemo(()=>rows.reduce((a,{p})=>({gross:a.gross+p.grossSalary,net:a.net+p.netSalary,incentive:a.incentive+p.incentiveTotal,deduct:a.deduct+p.totalDeduction}),{gross:0,net:0,incentive:0,deduct:0}),[rows]);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}><h2 style={S.pageTitle}>給与計算</h2><MonthPicker value={selectedMonth} onChange={setSelectedMonth}/></div>
      <div style={S.statsGrid}>
        {[
          {label:"総支給額",        value:`¥${fmt(totals.gross)}`,    color:"#00c9a7"},
          {label:"インセンティブ計", value:`¥${fmt(totals.incentive)}`,color:"#fc5c65"},
          {label:"控除合計",         value:`¥${fmt(totals.deduct)}`,   color:"#f7b731"},
          {label:"差引支給合計",     value:`¥${fmt(totals.net)}`,      color:"#6c63ff"},
        ].map(s=><div key={s.label} style={{...S.statCard,borderTopColor:s.color}}><div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div><div style={S.statLabel}>{s.label}</div></div>)}
      </div>

      {/* インセンティブ月次入力 */}
      {settings.incentiveMasters.length>0&&(
        <div style={{...S.card,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:incOpen?12:0,cursor:"pointer"}} onClick={()=>setIncOpen(o=>!o)}>
            <h3 style={{...S.cardTitle,marginBottom:0}}>💰 手当・インセンティブ 月次入力（{selectedMonth}）</h3>
            <span style={{fontSize:18,color:"#6c63ff",userSelect:"none"}}>{incOpen?"▲":"▼"}</span>
          </div>
          {incOpen&&<div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{...S.th,minWidth:100}}>従業員</th>
                  {settings.incentiveMasters.map(m=><th key={m.id} style={{...S.th,fontSize:11,minWidth:120}}>{m.name}<br/><span style={{fontSize:9,opacity:0.7}}>{m.taxable?"課税":"非課税"}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {employees.map(e=>{
                  const enabledIds=e.enabledIncentives||[];
                  if(enabledIds.length===0) return null;
                  return (
                    <tr key={e.id} style={S.tr}>
                      <td style={{...S.td,fontWeight:600}}>{e.name}</td>
                      {settings.incentiveMasters.map(m=>{
                        const enabled=enabledIds.includes(m.id);
                        return (
                          <td key={m.id} style={{...S.td,padding:"6px 8px"}}>
                            {enabled?(
                              <div style={{display:"flex",alignItems:"center",gap:2}}>
                                <span style={{fontSize:11}}>¥</span>
                                <input style={{...S.formInput,width:88,padding:"3px 6px",fontSize:12}} type="number" placeholder="0"
                                  value={mi[e.id]?.[m.id]||""}
                                  onChange={ev=>setMI(selectedMonth,e.id,m.id,Number(ev.target.value))}/>
                              </div>
                            ):<span style={{color:"#ddd",fontSize:11}}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{["氏名","雇用形態","基本給","残業代","インセンティブ","通勤手当","住宅・他","総支給","社保計","所得税","住民税","控除計","手取り"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({emp,p})=>(
              <tr key={emp.id} style={S.tr}>
                <td style={{...S.td,fontWeight:600}}>{emp.name}</td>
                <td style={S.td}><span style={S.typeBadge}>{emp.employmentType}</span></td>
                <td style={S.td}>¥{fmt(p.baseSalary)}</td>
                <td style={S.td}>{p.overtimePay>0?`¥${fmt(p.overtimePay)}`:"—"}</td>
                <td style={{...S.td,color:"#fc5c65",fontWeight:p.incentiveTotal>0?700:400}}>{p.incentiveTotal>0?`¥${fmt(p.incentiveTotal)}`:"—"}</td>
                <td style={{...S.td,padding:"4px 6px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:2}}>
                    <span style={{fontSize:10}}>¥</span>
                    <input style={{...S.formInput,width:80,padding:"3px 5px",fontSize:11}} type="number" placeholder="0"
                      value={monthTransport[emp.id]??emp.transportAllowance??0}
                      onChange={ev=>setMonthTransport(prev=>({...prev,[emp.id]:Number(ev.target.value)}))}/>
                  </div>
                </td>
                <td style={S.td}>{(p.housingAllowance+p.otherAllowance)>0?`¥${fmt(p.housingAllowance+p.otherAllowance)}`:"—"}</td>
                <td style={{...S.td,color:"#00c9a7",fontWeight:700}}>¥{fmt(p.grossSalary)}</td>
                <td style={S.td}>¥{fmt(p.socialTotal)}</td>
                <td style={S.td}>¥{fmt(p.incomeTax)}</td>
                <td style={S.td}>¥{fmt(p.residentTax)}</td>
                <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(p.totalDeduction)}</td>
                <td style={{...S.td,fontWeight:700}}>¥{fmt(p.netSalary)}</td>
              </tr>
            ))}
            <tr style={{background:"#f0f4ff",fontWeight:700}}>
              <td style={S.td} colSpan={4}>合計（{rows.length}名）</td>
              <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(totals.incentive)}</td>
              <td style={S.td}></td>
              <td style={{...S.td,color:"#00c9a7"}}>¥{fmt(totals.gross)}</td>
              <td colSpan={3} style={S.td}></td>
              <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(totals.deduct)}</td>
              <td style={S.td}>¥{fmt(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// PAYSLIP VIEW
// ============================================================

export default PayrollCalc;
