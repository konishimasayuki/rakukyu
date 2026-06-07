import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
function BonusCalc({ employees, settings, selectedMonth, setSelectedMonth, getBonus, setBonus, setBonusPayDate }) {
  const bd = getBonus(selectedMonth);
  const rows = employees.map(e=>({emp:e, b:calcBonusAmount(e, bd.data?.[e.id]?.bonus||0)}));
  const totals = rows.reduce((a,{b})=>({gross:a.gross+b.bonusAmount,net:a.net+b.netBonus,tax:a.tax+b.incomeTax}),{gross:0,net:0,tax:0});

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>賞与計算</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:"#f0edff",borderRadius:8}}>
            <span style={{fontSize:12,color:"#6c63ff",fontWeight:600}}>支給日</span>
            <input type="date" style={{...S.formInput,border:"none",background:"transparent",padding:"2px 4px",fontSize:13,color:"#1a1a2e"}}
              value={bd.payDate||""}
              onChange={e=>setBonusPayDate(selectedMonth,e.target.value)}/>
          </div>
        </div>
      </div>
      <div style={S.statsGrid}>
        {[
          {label:"賞与総額",    value:`¥${fmt(totals.gross)}`, color:"#f7b731"},
          {label:"差引支給合計",value:`¥${fmt(totals.net)}`,   color:"#00c9a7"},
          {label:"源泉所得税計",value:`¥${fmt(totals.tax)}`,   color:"#fc5c65"},
          {label:"支給日",      value:bd.payDate||"未設定",     color:"#6c63ff"},
        ].map(s=><div key={s.label} style={{...S.statCard,borderTopColor:s.color}}><div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div><div style={S.statLabel}>{s.label}</div></div>)}
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{["コード","氏名","部署","雇用形態","賞与支給額","健保","介護","厚年","雇保","所得税","控除計","手取り"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({emp,b})=>(
              <tr key={emp.id} style={S.tr}>
                <td style={{...S.td,fontSize:11,color:"#888",fontFamily:"monospace"}}>{emp.code||"—"}</td>
                <td style={{...S.td,fontWeight:600}}>{emp.name}</td>
                <td style={S.td}>{emp.department}</td>
                <td style={S.td}><span style={S.typeBadge}>{emp.employmentType}</span></td>
                <td style={{...S.td,padding:"6px 8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:2}}>
                    <span style={{fontSize:11}}>¥</span>
                    <input style={{...S.formInput,width:110,padding:"4px 6px",fontSize:13}} type="number" placeholder="0"
                      value={bd.data?.[emp.id]?.bonus||""}
                      onChange={ev=>setBonus(selectedMonth,emp.id,Number(ev.target.value))}/>
                  </div>
                </td>
                <td style={S.td}>{b.health>0?`¥${fmt(b.health)}`:"—"}</td>
                <td style={S.td}>{b.nursing>0?`¥${fmt(b.nursing)}`:"—"}</td>
                <td style={S.td}>{b.pension>0?`¥${fmt(b.pension)}`:"—"}</td>
                <td style={S.td}>{b.employment>0?`¥${fmt(b.employment)}`:"—"}</td>
                <td style={S.td}>{b.incomeTax>0?`¥${fmt(b.incomeTax)}`:"—"}</td>
                <td style={{...S.td,color:"#fc5c65"}}>{b.totalDeduction>0?`¥${fmt(b.totalDeduction)}`:"—"}</td>
                <td style={{...S.td,fontWeight:700,color:b.netBonus>0?"#00c9a7":"#333"}}>{b.netBonus>0?`¥${fmt(b.netBonus)}`:"—"}</td>
              </tr>
            ))}
            <tr style={{background:"#fff8e1",fontWeight:700}}>
              <td style={S.td} colSpan={4}>合計（{rows.filter(r=>r.b.bonusAmount>0).length}名）</td>
              <td style={{...S.td,color:"#f7b731"}}>¥{fmt(totals.gross)}</td>
              <td colSpan={5} style={S.td}></td>
              <td style={S.td}></td>
              <td style={{...S.td,color:"#00c9a7"}}>¥{fmt(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// BONUS SLIP（賞与計算と連動）
// ============================================================

export default BonusCalc;
