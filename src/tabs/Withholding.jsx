import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
function calcNextDeadline(today, payType) {
  const t = new Date(today);
  const y = t.getFullYear(), m = t.getMonth()+1;
  if (payType !== "special") {
    // 毎月納付：翌月10日
    const nm = m===12 ? 1 : m+1;
    const ny = m===12 ? y+1 : y;
    return `${ny}-${String(nm).padStart(2,"0")}-10`;
  } else {
    // 納期特例：1〜6月分→7/10、7〜12月分→翌1/20
    if (m>=1 && m<=6)  return `${y}-07-10`;
    return `${y+1}-01-20`;
  }
}
// どの月が次の納付対象かを返す
function calcNextPeriod(today, payType) {
  const t = new Date(today), m = t.getMonth()+1, y = t.getFullYear();
  if (payType !== "special") {
    // 当月分が翌月10日納付
    return [`${y}-${String(m).padStart(2,"0")}`];
  } else {
    if (m>=1 && m<=6)  return [1,2,3,4,5,6].map(mm=>`${y}-${String(mm).padStart(2,"0")}`);
    return [7,8,9,10,11,12].map(mm=>`${y}-${String(mm).padStart(2,"0")}`);
  }
}

function WithholdingTax({ employees, settings, getMI, getAtt, selectedMonth, setSelectedMonth }) {
  const TODAY = "2024-07-01"; // デモ用固定日付
  const isSpecial = settings.withholdingPayType === "special";

  const months = useMemo(()=>{
    const list=[];
    for(let i=0;i<12;i++){
      const d=new Date(selectedMonth+"-01");
      d.setMonth(d.getMonth()-i);
      list.push(d.toISOString().slice(0,7));
    }
    return list;
  },[selectedMonth]);

  const monthRows = useMemo(()=>months.map(m=>{
    const mi=getMI(m); const att=getAtt(m);
    const total=employees.reduce((s,e)=>{
      const p=calcPayroll(e,m,settings,settings.incentiveMasters,mi,att[e.id]);
      return s+p.incomeTax;
    },0);
    return { month:m, incomeTax:total };
  }),[months,employees,settings]);

  const yearTotal = monthRows.reduce((s,r)=>s+r.incomeTax,0);

  // 次の納付日と金額
  const nextDeadline = calcNextDeadline(TODAY, settings.withholdingPayType);
  const nextPeriodMonths = calcNextPeriod(TODAY, settings.withholdingPayType);
  const nextAmount = nextPeriodMonths.reduce((s,m)=>s+(monthRows.find(r=>r.month===m)?.incomeTax||0),0);
  const nextPeriodLabel = isSpecial
    ? `${nextPeriodMonths[0].slice(5,7).replace(/^0/,"")}〜${nextPeriodMonths[nextPeriodMonths.length-1].slice(5,7).replace(/^0/,"")}月分`
    : `${nextPeriodMonths[0].replace("-","年")}月分`;

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>源泉管理</h2>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
      </div>
      {/* 次の納付サマリー */}
      <div style={{marginBottom:16,padding:"14px 20px",background:"linear-gradient(135deg,#1a1a2e,#2d2d5e)",borderRadius:12,color:"white",display:"flex",gap:32,flexWrap:"wrap",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>📅 次の納付期限</div>
          <div style={{fontSize:20,fontWeight:900,color:"#f7b731"}}>{nextDeadline}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{nextPeriodLabel}（{isSpecial?"納期特例":"毎月納付"}）</div>
        </div>
        <div style={{width:1,height:48,background:"#ffffff20"}}/>
        <div>
          <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>💴 次回納付金額</div>
          <div style={{fontSize:20,fontWeight:900,color:"#fc5c65"}}>¥{fmt(nextAmount)}</div>
          <div style={{fontSize:11,color:"#aaa",marginTop:2}}>源泉所得税合計</div>
        </div>
        <div style={{width:1,height:48,background:"#ffffff20"}}/>
        <div>
          <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>納付方法</div>
          <div style={{fontSize:14,fontWeight:700,color:"white"}}>{isSpecial?"納期特例（半年納付）":"毎月納付（翌月10日）"}</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>設定タブで変更可</div>
        </div>
      </div>
      <div style={S.statsGrid}>
        {[
          {label:"今月の預かり源泉税",   value:`¥${fmt(monthRows[0]?.incomeTax||0)}`, color:"#fc5c65"},
          {label:"直近12ヶ月 源泉合計",  value:`¥${fmt(yearTotal)}`,                  color:"#6c63ff"},
          {label:"対象従業員数",          value:`${employees.length}名`,               color:"#00c9a7"},
        ].map(s=><div key={s.label} style={{...S.statCard,borderTopColor:s.color}}><div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div><div style={S.statLabel}>{s.label}</div></div>)}
      </div>

      {/* 今月の従業員別内訳 */}
      <div style={{...S.card,marginBottom:16}}>
        <h3 style={S.cardTitle}>📋 {selectedMonth} 従業員別 源泉所得税内訳</h3>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{["氏名","部署","雇用形態","総支給額","課税対象額","源泉所得税"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {employees.map(e=>{
                const mi=getMI(selectedMonth); const att=getAtt(selectedMonth);
                const p=calcPayroll(e,selectedMonth,settings,settings.incentiveMasters,mi,att[e.id]);
                const taxBase=p.grossSalary-p.transportAllowance-p.health-p.nursing-p.pension;
                return (
                  <tr key={e.id} style={S.tr}>
                    <td style={{...S.td,fontWeight:600}}>{e.name}</td>
                    <td style={S.td}>{e.department}</td>
                    <td style={S.td}><span style={S.typeBadge}>{e.employmentType}</span></td>
                    <td style={S.td}>¥{fmt(p.grossSalary)}</td>
                    <td style={S.td}>¥{fmt(taxBase)}</td>
                    <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>¥{fmt(p.incomeTax)}</td>
                  </tr>
                );
              })}
              <tr style={{background:"#f0f4ff",fontWeight:700}}>
                <td style={S.td} colSpan={5}>合計</td>
                <td style={{...S.td,color:"#fc5c65"}}>¥{fmt(monthRows[0]?.incomeTax||0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 月別推移 */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>📅 月別 源泉所得税 推移（直近12ヶ月）</h3>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{[settings.withholdingPayType==="special"?"対象期間":"対象年月","預かり源泉税額",settings.withholdingPayType==="special"?"納付期限":"納付期限（翌月10日）","ステータス"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {(()=>{
                const isSpecial = settings.withholdingPayType==="special";
                if (!isSpecial) {
                  // 毎月納付：翌月10日
                  return monthRows.map(r=>{
                    const d=new Date(r.month+"-01");
                    d.setMonth(d.getMonth()+1);
                    const deadline=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-10`;
                    const isPast=new Date(deadline)<new Date("2024-07-01");
                    return (
                      <tr key={r.month} style={S.tr}>
                        <td style={{...S.td,fontWeight:r.month===selectedMonth?700:400}}>{r.month.replace("-","年")}月</td>
                        <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>¥{fmt(r.incomeTax)}</td>
                        <td style={S.td}>{deadline}</td>
                        <td style={S.td}>
                          <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background:isPast?"#e8f8f0":"#fff8e1",color:isPast?"#2e7d32":"#e07000"}}>
                            {isPast?"✓ 納付済み":"⏳ 未納付"}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                } else {
                  // 納期特例：半期ごとにまとめる
                  const year = selectedMonth.slice(0,4);
                  const groups = [
                    { label:`${year}年 1〜6月分`, months:[1,2,3,4,5,6], deadline:`${year}-07-10`,   isPast:new Date(`${year}-07-10`)<new Date("2024-07-11") },
                    { label:`${year}年 7〜12月分`,months:[7,8,9,10,11,12],deadline:`${Number(year)+1}-01-20`, isPast:false },
                  ];
                  return groups.map(g=>{
                    const total = g.months.reduce((s,m)=>{
                      const mo=`${year}-${String(m).padStart(2,"0")}`;
                      return s+(monthRows.find(r=>r.month===mo)?.incomeTax||0);
                    },0);
                    return (
                      <tr key={g.label} style={S.tr}>
                        <td style={{...S.td,fontWeight:600}}>{g.label}</td>
                        <td style={{...S.td,fontWeight:700,color:"#fc5c65"}}>¥{fmt(total)}</td>
                        <td style={{...S.td,fontWeight:600}}>{g.deadline}</td>
                        <td style={S.td}>
                          <span style={{display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,background:g.isPast?"#e8f8f0":"#fff8e1",color:g.isPast?"#2e7d32":"#e07000"}}>
                            {g.isPast?"✓ 納付済み":"⏳ 未納付"}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                }
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================

export default WithholdingTax;
