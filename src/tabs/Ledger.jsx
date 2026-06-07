import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
import { printLedger, printLedgerYearly, printLedgerEmpYearly } from "../utils/printPDF";
function LedgerView({ employees, settings, getMI, getAtt, getBonus, selectedMonth, setSelectedMonth, onPrint }) {
  const [ledgerMode,   setLedgerMode]   = useState("monthly"); // monthly | yearly
  const [selectedEmpId, setSelectedEmpId] = useState("all");   // "all" or empId
  const selectedYear = selectedMonth.slice(0,4);

  // 月次：従業員フィルター
  const mi=getMI(selectedMonth); const att=getAtt(selectedMonth);
  const monthTarget = selectedEmpId==="all" ? employees : employees.filter(e=>e.id===Number(selectedEmpId));
  const monthRows = useMemo(()=>monthTarget.map(e=>({emp:e,p:calcPayroll(e,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id])})),[monthTarget,selectedMonth,settings,mi,att]);
  const monthTotals = useMemo(()=>monthRows.reduce((a,{p})=>({gross:a.gross+p.grossSalary,deduct:a.deduct+p.totalDeduction,net:a.net+p.netSalary,inc:a.inc+p.incentiveTotal}),{gross:0,deduct:0,net:0,inc:0}),[monthRows]);

  // 年次：全員集計 or 個人別12ヶ月展開
  const MONTHS_12 = useMemo(()=>Array.from({length:12},(_,i)=>`${selectedYear}-${String(i+1).padStart(2,"0")}`),[selectedYear]);

  // 全員モード：1人1行（年間集計）
  const yearRows = useMemo(()=>{
    const target = selectedEmpId==="all" ? employees : employees.filter(e=>e.id===Number(selectedEmpId));
    return target.map(e=>{
      let gross=0,deduct=0,net=0,inc=0,health=0,nursing=0,pension=0,employment=0,incomeTax=0,residentTax=0;
      let bonusGross=0,bonusDeduct=0,bonusNet=0;
      MONTHS_12.forEach(m=>{
        const p=calcPayroll(e,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[e.id]);
        gross+=p.grossSalary; deduct+=p.totalDeduction; net+=p.netSalary; inc+=p.incentiveTotal;
        health+=p.health; nursing+=p.nursing; pension+=p.pension; employment+=p.employment;
        incomeTax+=p.incomeTax; residentTax+=p.residentTax;
        // 賞与
        const bAmt = getBonus(m)?.data?.[e.id]?.bonus||0;
        if (bAmt>0) {
          const b=calcBonusAmount(e,bAmt);
          bonusGross+=b.bonusAmount; bonusDeduct+=b.totalDeduction; bonusNet+=b.netBonus;
          health+=b.health; nursing+=b.nursing; pension+=b.pension; employment+=b.employment;
          incomeTax+=b.incomeTax; deduct+=b.totalDeduction;
        }
      });
      return {emp:e,gross,deduct,net,inc,health,nursing,pension,employment,incomeTax,residentTax,bonusGross,bonusDeduct,bonusNet};
    });
  },[employees,selectedEmpId,selectedYear,settings,getMI,getAtt,getBonus,MONTHS_12]);

  // 個人選択時：1〜12月の月別展開（賞与含む）
  const empMonthRows = useMemo(()=>{
    if (selectedEmpId==="all") return [];
    const e = employees.find(emp=>emp.id===Number(selectedEmpId));
    if (!e) return [];
    return MONTHS_12.map(m=>{
      const p=calcPayroll(e,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[e.id]);
      const bAmt = getBonus(m)?.data?.[e.id]?.bonus||0;
      const b = bAmt>0 ? calcBonusAmount(e,bAmt) : null;
      const payDate = getBonus(m)?.payDate||"";
      return {month:m, p, bonus:b, bonusAmt:bAmt, payDate};
    });
  },[selectedEmpId,employees,MONTHS_12,settings,getMI,getAtt,getBonus]);
  const empMonthTotals = useMemo(()=>empMonthRows.reduce((a,{p,bonus})=>({
    gross:a.gross+p.grossSalary+(bonus?.bonusAmount||0),
    deduct:a.deduct+p.totalDeduction+(bonus?.totalDeduction||0),
    net:a.net+p.netSalary+(bonus?.netBonus||0),
    incomeTax:a.incomeTax+p.incomeTax+(bonus?.incomeTax||0),
    bonusGross:a.bonusGross+(bonus?.bonusAmount||0),
  }),{gross:0,deduct:0,net:0,incomeTax:0,bonusGross:0}),[empMonthRows]);

  const yearTotals = useMemo(()=>yearRows.reduce((a,r)=>({gross:a.gross+r.gross,deduct:a.deduct+r.deduct,net:a.net+r.net,inc:a.inc+r.inc,incomeTax:a.incomeTax+r.incomeTax}),{gross:0,deduct:0,net:0,inc:0,incomeTax:0}),[yearRows]);

  const TH_MONTH = ["氏名","部署","雇用","基本給","残業代","インセンティブ","各手当","総支給","健保","介護","厚年","雇保","所得税","住民税","控除計","手取り"];
  const TH_YEAR  = ["氏名","部署","雇用形態","給与総支給","賞与支給","年間総支給","健保計","介護計","厚年計","雇保計","所得税計","住民税計","控除合計","年間手取り"];
  const TH_EMP   = ["月","基本給","残業代","インセンティブ","各手当","総支給","健保","介護","厚年","雇保","所得税","住民税","控除計","手取り"];

  const selectedEmp = employees.find(e=>e.id===Number(selectedEmpId));

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>賃金台帳</h2>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {/* 月次/年次切替 */}
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #ddd"}}>
            <button style={{padding:"7px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:ledgerMode==="monthly"?700:400,background:ledgerMode==="monthly"?"#6c63ff":"white",color:ledgerMode==="monthly"?"white":"#666"}} onClick={()=>setLedgerMode("monthly")}>月次</button>
            <button style={{padding:"7px 16px",border:"none",cursor:"pointer",fontSize:12,fontWeight:ledgerMode==="yearly"?700:400,background:ledgerMode==="yearly"?"#6c63ff":"white",color:ledgerMode==="yearly"?"white":"#666"}} onClick={()=>setLedgerMode("yearly")}>年次</button>
          </div>
          {/* 従業員選択 */}
          <select style={{...S.formInput,width:"auto",maxWidth:160}} value={selectedEmpId} onChange={e=>setSelectedEmpId(e.target.value)}>
            <option value="all">全員</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:''}{e.name}</option>)}
          </select>
          {/* 期間 */}
          {ledgerMode==="monthly"
            ? <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
            : <div style={{display:"flex",alignItems:"center",gap:6}}>
                <select style={{...S.formInput,width:"auto"}} value={selectedYear} onChange={e=>setSelectedMonth(`${e.target.value}-01`)}>
                  {["2024","2023","2022"].map(y=><option key={y}>{y}</option>)}
                </select>
                <span style={{fontSize:12,color:"#666"}}>年</span>
              </div>
          }
          <button style={S.primaryBtn} onClick={()=>{
            if (ledgerMode==="monthly") {
              onPrint(selectedEmpId==="all"?employees:employees.filter(e=>e.id===Number(selectedEmpId)), selectedMonth, settings, settings.incentiveMasters, mi, att);
            } else if (ledgerMode==="yearly" && selectedEmpId!=="all" && selectedEmp) {
              printLedgerEmpYearly(selectedEmp, selectedYear, settings, getMI, getAtt, getBonus);
            } else {
              printLedgerYearly(selectedEmpId==="all"?employees:employees.filter(e=>e.id===Number(selectedEmpId)), selectedYear, settings, getMI, getAtt, getBonus);
            }
          }}>📋 PDF印刷</button>
        </div>
      </div>

      {/* サマリーバー */}
      <div style={{marginBottom:12,padding:"10px 16px",background:"#1a1a2e",color:"white",borderRadius:8,display:"flex",gap:24,flexWrap:"wrap",fontSize:13}}>
        {ledgerMode==="monthly" ? <>
          <span>対象年月: <b>{selectedMonth.replace("-","年")}月</b></span>
          <span>対象: <b>{selectedEmpId==="all"?`全員（${employees.length}名）`:selectedEmp?.name}</b></span>
          <span>総支給計: <b>¥{fmt(monthTotals.gross)}</b></span>
          <span>インセンティブ計: <b style={{color:"#fc5c65"}}>¥{fmt(monthTotals.inc)}</b></span>
          <span>差引支給計: <b style={{color:"#00c9a7"}}>¥{fmt(monthTotals.net)}</b></span>
        </> : <>
          <span>対象年: <b>{selectedYear}年（1〜12月）</b></span>
          <span>対象: <b>{selectedEmpId==="all"?`全員（${employees.length}名）`:selectedEmp?.name}</b></span>
          <span>年間総支給計: <b>¥{fmt(selectedEmpId==="all"?yearTotals.gross:empMonthTotals.gross)}</b></span>
          <span>年間源泉税計: <b style={{color:"#fc5c65"}}>¥{fmt(selectedEmpId==="all"?yearTotals.incomeTax:empMonthTotals.incomeTax)}</b></span>
          <span>年間手取り計: <b style={{color:"#00c9a7"}}>¥{fmt(selectedEmpId==="all"?yearTotals.net:empMonthTotals.net)}</b></span>
        </>}
      </div>

      {/* 月次テーブル */}
      {ledgerMode==="monthly" && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{TH_MONTH.map(h=><th key={h} style={{...S.th,fontSize:10,padding:"6px 5px"}}>{h}</th>)}</tr></thead>
            <tbody>
              {monthRows.map(({emp,p})=>(
                <tr key={emp.id} style={S.tr}>
                  <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>{emp.name}</td>
                  <td style={{...S.td,fontSize:11}}>{emp.department}</td>
                  <td style={{...S.td,fontSize:10}}>{emp.employmentType}</td>
                  <td style={{...S.td,fontSize:11}}>{fmt(p.baseSalary)}</td>
                  <td style={{...S.td,fontSize:11}}>{p.overtimePay>0?fmt(p.overtimePay):"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>{p.incentiveTotal>0?fmt(p.incentiveTotal):"—"}</td>
                  <td style={{...S.td,fontSize:11}}>{fmt(p.transportAllowance+p.housingAllowance+p.otherAllowance)||"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>{fmt(p.grossSalary)}</td>
                  {[p.health,p.nursing,p.pension,p.employment,p.incomeTax,p.residentTax].map((v,i)=><td key={i} style={{...S.td,fontSize:11}}>{v>0?fmt(v):"—"}</td>)}
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(p.totalDeduction)}</td>
                  <td style={{...S.td,fontWeight:700}}>{fmt(p.netSalary)}</td>
                </tr>
              ))}
              {selectedEmpId==="all"&&(
                <tr style={{background:"#f0f4ff",fontWeight:700}}>
                  <td style={S.td} colSpan={4}>合計（{monthRows.length}名）</td>
                  <td style={S.td}></td>
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(monthTotals.inc)}</td>
                  <td style={S.td}></td>
                  <td style={{...S.td,color:"#00c9a7"}}>{fmt(monthTotals.gross)}</td>
                  <td colSpan={6} style={S.td}></td>
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(monthTotals.deduct)}</td>
                  <td style={S.td}>{fmt(monthTotals.net)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 年次：全員テーブル */}
      {ledgerMode==="yearly" && selectedEmpId==="all" && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{TH_YEAR.map(h=><th key={h} style={{...S.th,fontSize:10,padding:"6px 5px"}}>{h}</th>)}</tr></thead>
            <tbody>
              {yearRows.map(r=>(
                <tr key={r.emp.id} style={S.tr}>
                  <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>{r.emp.name}</td>
                  <td style={{...S.td,fontSize:11}}>{r.emp.department}</td>
                  <td style={{...S.td,fontSize:10}}>{r.emp.employmentType}</td>
                  <td style={{...S.td,fontSize:11}}>{fmt(r.gross)}</td>
                  <td style={{...S.td,color:"#f7b731",fontWeight:r.bonusGross>0?700:400}}>{r.bonusGross>0?fmt(r.bonusGross):"—"}</td>
                  <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>{fmt(r.gross+r.bonusGross)}</td>
                  {[r.health,r.nursing,r.pension,r.employment,r.incomeTax,r.residentTax].map((v,i)=>(
                    <td key={i} style={{...S.td,fontSize:11}}>{v>0?fmt(v):"—"}</td>
                  ))}
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(r.deduct)}</td>
                  <td style={{...S.td,fontWeight:700}}>{fmt(r.net+r.bonusNet)}</td>
                </tr>
              ))}
              <tr style={{background:"#f0f4ff",fontWeight:700}}>
                <td style={S.td} colSpan={3}>合計（{yearRows.length}名）</td>
                <td style={S.td}>{fmt(yearTotals.gross)}</td>
                <td style={{...S.td,color:"#f7b731"}}>{fmt(yearRows.reduce((s,r)=>s+r.bonusGross,0))}</td>
                <td style={{...S.td,color:"#00c9a7"}}>{fmt(yearTotals.gross+yearRows.reduce((s,r)=>s+r.bonusGross,0))}</td>
                <td colSpan={6} style={S.td}></td>
                <td style={{...S.td,color:"#fc5c65"}}>{fmt(yearTotals.deduct)}</td>
                <td style={S.td}>{fmt(yearTotals.net+yearRows.reduce((s,r)=>s+r.bonusNet,0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 年次：個人別 1〜12月展開 */}
      {ledgerMode==="yearly" && selectedEmpId!=="all" && selectedEmp && (
        <div>
          <div style={{marginBottom:10,padding:"8px 14px",background:"#f0edff",borderRadius:8,fontSize:12,color:"#6c63ff"}}>
            <b>{selectedEmp.name}</b>（{selectedEmp.department}・{selectedEmp.employmentType}）　{selectedYear}年 月別明細
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead><tr>{TH_EMP.map(h=><th key={h} style={{...S.th,fontSize:10,padding:"6px 5px"}}>{h}</th>)}</tr></thead>
              <tbody>
                {/* 月別給与行 */}
                {empMonthRows.map(({month,p})=>(
                  <tr key={month} style={S.tr}>
                    <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>{month.replace("-","年")}月</td>
                    <td style={{...S.td,fontSize:11}}>{fmt(p.baseSalary)}</td>
                    <td style={{...S.td,fontSize:11}}>{p.overtimePay>0?fmt(p.overtimePay):"—"}</td>
                    <td style={{...S.td,color:"#fc5c65"}}>{p.incentiveTotal>0?fmt(p.incentiveTotal):"—"}</td>
                    <td style={{...S.td,fontSize:11}}>{fmt(p.transportAllowance+p.housingAllowance+p.otherAllowance)||"—"}</td>
                    <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>{fmt(p.grossSalary)}</td>
                    {[p.health,p.nursing,p.pension,p.employment,p.incomeTax,p.residentTax].map((v,i)=>(
                      <td key={i} style={{...S.td,fontSize:11}}>{v>0?fmt(v):"—"}</td>
                    ))}
                    <td style={{...S.td,color:"#fc5c65"}}>{fmt(p.totalDeduction)}</td>
                    <td style={{...S.td,fontWeight:700}}>{fmt(p.netSalary)}</td>
                  </tr>
                ))}

                {/* ── 給与合計 ── */}
                {(()=>{
                  const sg = empMonthRows.reduce((a,{p})=>({
                    base:a.base+p.baseSalary, ot:a.ot+p.overtimePay, inc:a.inc+p.incentiveTotal,
                    allow:a.allow+(p.transportAllowance+p.housingAllowance+p.otherAllowance),
                    gross:a.gross+p.grossSalary,
                    health:a.health+p.health, nursing:a.nursing+p.nursing,
                    pension:a.pension+p.pension, employment:a.employment+p.employment,
                    incomeTax:a.incomeTax+p.incomeTax, residentTax:a.residentTax+p.residentTax,
                    deduct:a.deduct+p.totalDeduction, net:a.net+p.netSalary,
                  }),{base:0,ot:0,inc:0,allow:0,gross:0,health:0,nursing:0,pension:0,employment:0,incomeTax:0,residentTax:0,deduct:0,net:0});
                  return (
                    <tr style={{background:"#e8f0ff",fontWeight:700,borderTop:"2px solid #6c63ff"}}>
                      <td style={{...S.td,color:"#6c63ff",whiteSpace:"nowrap"}}>給与合計</td>
                      <td style={{...S.td,fontSize:11}}>{fmt(sg.base)}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.ot>0?fmt(sg.ot):"—"}</td>
                      <td style={{...S.td,color:"#fc5c65"}}>{sg.inc>0?fmt(sg.inc):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.allow>0?fmt(sg.allow):"—"}</td>
                      <td style={{...S.td,color:"#00c9a7"}}>{fmt(sg.gross)}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.health>0?fmt(sg.health):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.nursing>0?fmt(sg.nursing):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.pension>0?fmt(sg.pension):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.employment>0?fmt(sg.employment):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.incomeTax>0?fmt(sg.incomeTax):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{sg.residentTax>0?fmt(sg.residentTax):"—"}</td>
                      <td style={{...S.td,color:"#fc5c65"}}>{fmt(sg.deduct)}</td>
                      <td style={S.td}>{fmt(sg.net)}</td>
                    </tr>
                  );
                })()}

                {/* ── 賞与明細 + 賞与合計（賞与がある年のみ） ── */}
                {empMonthTotals.bonusGross>0&&(()=>{
                  const bonusMonths = empMonthRows.filter(r=>r.bonusAmt>0);
                  const bg = bonusMonths.reduce((a,{bonus})=>bonus?({
                    gross:   a.gross+bonus.bonusAmount,
                    health:  a.health+bonus.health,
                    nursing: a.nursing+bonus.nursing,
                    pension: a.pension+bonus.pension,
                    employment:a.employment+bonus.employment,
                    incomeTax: a.incomeTax+bonus.incomeTax,
                    deduct:  a.deduct+bonus.totalDeduction,
                    net:     a.net+bonus.netBonus,
                  }):a,{gross:0,health:0,nursing:0,pension:0,employment:0,incomeTax:0,deduct:0,net:0});
                  return (<>
                    {/* 賞与月ごとの明細行 */}
                    {bonusMonths.map(({month,bonus,bonusAmt,payDate})=>(
                      <tr key={`bonus-${month}`} style={S.tr}>
                        <td style={{...S.td,fontWeight:600,whiteSpace:"nowrap"}}>
                          {month.replace("-","年")}月
                          <div style={{fontSize:9,color:"#6c63ff",fontWeight:600}}>賞与{payDate?` (${payDate})`:""}</div>
                        </td>
                        <td colSpan={4} style={{...S.td,fontWeight:700,fontSize:12}}>
                          支給額　¥{fmt(bonusAmt)}
                        </td>
                        <td style={{...S.td,fontWeight:700,color:"#00c9a7"}}>¥{fmt(bonusAmt)}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.health>0?fmt(bonus.health):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.nursing>0?fmt(bonus.nursing):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.pension>0?fmt(bonus.pension):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.employment>0?fmt(bonus.employment):"—"}</td>
                        <td style={{...S.td,fontSize:11}}>{bonus.incomeTax>0?fmt(bonus.incomeTax):"—"}</td>
                        <td style={S.td}>—</td>
                        <td style={{...S.td,color:"#fc5c65"}}>{fmt(bonus.totalDeduction)}</td>
                        <td style={{...S.td,fontWeight:700}}>{fmt(bonus.netBonus)}</td>
                      </tr>
                    ))}
                    {/* 賞与合計行 */}
                    <tr style={{background:"#fff3cd",fontWeight:700,borderTop:"2px solid #f7b731"}}>
                      <td style={{...S.td,fontWeight:700,whiteSpace:"nowrap"}}>賞与合計</td>
                      <td colSpan={4} style={{...S.td,fontSize:11,color:"#888"}}>
                        {bonusMonths.length}回分
                      </td>
                      <td style={{...S.td,color:"#f7b731"}}>{fmt(bg.gross)}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.health>0?fmt(bg.health):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.nursing>0?fmt(bg.nursing):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.pension>0?fmt(bg.pension):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.employment>0?fmt(bg.employment):"—"}</td>
                      <td style={{...S.td,fontSize:11}}>{bg.incomeTax>0?fmt(bg.incomeTax):"—"}</td>
                      <td style={S.td}>—</td>
                      <td style={{...S.td,color:"#fc5c65"}}>{fmt(bg.deduct)}</td>
                      <td style={S.td}>{fmt(bg.net)}</td>
                    </tr>
                  </>);
                })()}

                {/* ── 年間総合計 ── */}
                <tr style={{background:"#1a1a2e",fontWeight:700,borderTop:"2px solid #1a1a2e"}}>
                  {["年間合計","","","",""].map((v,i)=>(
                    <td key={i} style={{...S.td,color:"white",fontSize:i===0?12:11}}>{v}</td>
                  ))}
                  <td style={{...S.td,color:"#00c9a7",fontWeight:900}}>{fmt(empMonthTotals.gross)}</td>
                  {[0,1,2,3,4,5].map(i=><td key={i} style={{...S.td,color:"#aaa",fontSize:10}}>
                    {fmt([
                      empMonthRows.reduce((s,{p,bonus})=>s+p.health+(bonus?.health||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.nursing+(bonus?.nursing||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.pension+(bonus?.pension||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.employment+(bonus?.employment||0),0),
                      empMonthRows.reduce((s,{p,bonus})=>s+p.incomeTax+(bonus?.incomeTax||0),0),
                      empMonthRows.reduce((s,{p})=>s+p.residentTax,0),
                    ][i])||"—"}
                  </td>)}
                  <td style={{...S.td,color:"#fc5c65"}}>{fmt(empMonthTotals.deduct)}</td>
                  <td style={{...S.td,color:"#00c9a7",fontWeight:900}}>{fmt(empMonthTotals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// WITHHOLDING TAX
// ============================================================
// 次の納付日を計算するヘルパー

export default LedgerView;
