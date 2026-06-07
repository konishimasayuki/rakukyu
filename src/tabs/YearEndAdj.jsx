import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
import MonthPicker from "./MonthPicker";
import { printGensenhyou, printGensenchousho } from "../utils/printPDF";

function calcKyuyoShotokuKojo(income) {
  if (income <= 1625000)  return 550000;
  if (income <= 1800000)  return Math.floor(income * 0.4 - 100000);
  if (income <= 3600000)  return Math.floor(income * 0.3 + 80000);
  if (income <= 6600000)  return Math.floor(income * 0.2 + 440000);
  if (income <= 8500000)  return Math.floor(income * 0.1 + 1100000);
  return 1950000;
}

// 基礎控除（令和6年度）
function calcKisoKojo(income) {
  if (income <= 24000000) return 480000;
  if (income <= 24500000) return 320000;
  if (income <= 25000000) return 160000;
  return 0;
}

// 配偶者控除
function calcHaigu(spouseIncome, ownIncome) {
  if (spouseIncome > 1030000) return 0;
  if (ownIncome <= 9000000)   return 380000;
  if (ownIncome <= 9500000)   return 260000;
  if (ownIncome <= 10000000)  return 130000;
  return 0;
}

// 配偶者特別控除
function calcHaiguTokubetsu(spouseIncome, ownIncome) {
  if (spouseIncome <= 1030000 || spouseIncome > 2015999) return 0;
  if (ownIncome > 10000000) return 0;
  const table = [
    [1030001,1059999,380000,260000,130000],
    [1060000,1099999,360000,240000,120000],
    [1100000,1149999,310000,210000,110000],
    [1150000,1199999,260000,180000,90000],
    [1200000,1249999,210000,140000,70000],
    [1250000,1299999,160000,110000,60000],
    [1300000,1399999,110000,80000,40000],
    [1400000,1499999,60000,40000,20000],
    [1500000,2015999,30000,20000,10000],
  ];
  for (const [lo,hi,a,b,d] of table) {
    if (spouseIncome >= lo && spouseIncome <= hi) {
      if (ownIncome <= 9000000) return a;
      if (ownIncome <= 9500000) return b;
      return d;
    }
  }
  return 0;
}

// 生命保険料控除（新制度）
function calcSeimei(paid) {
  if (paid <= 20000)  return paid;
  if (paid <= 40000)  return Math.floor(paid / 2 + 10000);
  if (paid <= 80000)  return Math.floor(paid / 4 + 20000);
  return 40000;
}

// 所得税計算（年税額用・超過累進）
function calcNenZei(taxableIncome) {
  const t = Math.floor(taxableIncome / 1000) * 1000;
  if (t <= 1950000)  return Math.floor(t * 0.05);
  if (t <= 3300000)  return Math.floor(t * 0.1  - 97500);
  if (t <= 6950000)  return Math.floor(t * 0.2  - 427500);
  if (t <= 9000000)  return Math.floor(t * 0.23 - 636000);
  if (t <= 18000000) return Math.floor(t * 0.33 - 1536000);
  if (t <= 40000000) return Math.floor(t * 0.4  - 2796000);
  return Math.floor(t * 0.45 - 4796000);
}

// 復興特別所得税込み
function calcFinalTax(nenZei) {
  return Math.floor(nenZei * 1.021);
}

function YearEndAdj({ employees, settings, getMI, getAtt, getBonus, yearEndData, setYearEndData }) {
  const [selectedYear, setSelectedYear] = useState("2024");
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || null);
  const [view, setView] = useState("list"); // list | input | result

  const emp = employees.find(e => e.id === selectedEmpId);

  // 年間給与集計（1〜12月）賞与含む
  const calcAnnual = (empId) => {
    let totalGross = 0, totalSocialIns = 0, totalWithheld = 0;
    let bonusGross = 0, bonusSocialIns = 0, bonusWithheld = 0;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return { totalGross:0, totalSocialIns:0, totalWithheld:0 };
    for (let m = 1; m <= 12; m++) {
      const month = `${selectedYear}-${String(m).padStart(2,"0")}`;
      const p = calcPayroll(emp, month, settings, settings.incentiveMasters, getMI(month), getAtt(month)[empId]);
      totalGross    += p.grossSalary;
      totalSocialIns += p.socialTotal;
      totalWithheld  += p.incomeTax;
      // 賞与
      const bAmt = getBonus(month)?.data?.[empId]?.bonus||0;
      if (bAmt>0) {
        const b = calcBonusAmount(emp, bAmt);
        bonusGross    += b.bonusAmount;
        bonusSocialIns += b.health+b.nursing+b.pension+b.employment;
        bonusWithheld  += b.incomeTax;
      }
    }
    return {
      totalGross: totalGross+bonusGross,
      totalSocialIns: totalSocialIns+bonusSocialIns,
      totalWithheld: totalWithheld+bonusWithheld,
      salaryGross: totalGross,
      bonusGross,
    };
  };

  // 年末調整計算
  const calcYearEnd = (empId) => {
    const d   = yearEndData[empId] || {};
    const ann = calcAnnual(empId);
    const emp = employees.find(e => e.id === empId);
    if (!emp) return null;

    const kyuyoShotoku = Math.max(0, ann.totalGross - calcKyuyoShotokuKojo(ann.totalGross));
    const kisoKojo     = calcKisoKojo(kyuyoShotoku);

    // 配偶者控除
    const spouseIncome = d.spouseIncome || 0;
    const haiguKojo    = d.hasSpouse
      ? (spouseIncome <= 1030000
          ? calcHaigu(spouseIncome, kyuyoShotoku)
          : calcHaiguTokubetsu(spouseIncome, kyuyoShotoku))
      : 0;

    // 扶養控除
    const dep_general  = (d.dep_general  || 0) * 380000;  // 一般扶養（16〜18、23〜69歳）
    const dep_specific = (d.dep_specific || 0) * 630000;  // 特定扶養（19〜22歳）
    const dep_elderly  = (d.dep_elderly  || 0) * 480000;  // 老人扶養（70歳以上）
    const dep_elive    = (d.dep_elive    || 0) * 580000;  // 同居老親等
    const fuyo = dep_general + dep_specific + dep_elderly + dep_elive;

    // 生命保険料控除
    const seimei_new_life  = calcSeimei(d.seimei_new_life  || 0);
    const seimei_new_annuity= calcSeimei(d.seimei_new_annuity|| 0);
    const seimei_new_care  = calcSeimei(d.seimei_new_care  || 0);
    const seimeiKojo = Math.min(120000, seimei_new_life + seimei_new_annuity + seimei_new_care);

    // 地震保険料控除
    const jishin = Math.min(50000, d.jishinHoken || 0);

    // 住宅借入金等特別控除（税額控除）
    const jutakuKojo = d.jutakuKojo || 0;

    // 障害者控除
    const shogai_general = (d.shogai_general || 0) * 270000;
    const shogai_special  = (d.shogai_special  || 0) * 400000;
    const shogai_live     = (d.shogai_live     || 0) * 750000;
    const shogaiKojo = shogai_general + shogai_special + shogai_live;

    // 寡婦・ひとり親控除
    const kabufuKojo    = d.kabufu    ? 270000 : 0;
    const hitorioyanKojo= d.hitorioyan? 350000 : 0;

    // 勤労学生控除
    const kinroGakusei = d.kinroGakusei ? 270000 : 0;

    // 小規模企業共済等
    const shoukibo = d.shoukibo || 0;

    // 社会保険料控除（月次データ自動集計）
    const shakaihoken = ann.totalSocialIns;

    // 所得控除合計
    const totalKojo = kisoKojo + haiguKojo + fuyo + seimeiKojo + jishin +
                      shogaiKojo + kabufuKojo + hitorioyanKojo + kinroGakusei +
                      shoukibo + shakaihoken;

    // 課税所得
    const kazeiShotoku = Math.max(0, kyuyoShotoku - totalKojo);

    // 年税額
    const nenZei     = calcNenZei(kazeiShotoku);
    const finalTax   = calcFinalTax(nenZei) - jutakuKojo;  // 住宅控除は税額控除
    const adjustedTax= Math.max(0, finalTax);

    // 過不足
    const diff = ann.totalWithheld - adjustedTax;  // プラス＝還付、マイナス＝追加徴収

    return {
      ...ann, kyuyoShotoku, kisoKojo, haiguKojo, fuyo,
      seimeiKojo, jishin, jutakuKojo, shogaiKojo, kabufuKojo, hitorioyanKojo,
      kinroGakusei, shoukibo, shakaihoken, totalKojo,
      kazeiShotoku, nenZei, finalTax: adjustedTax, diff,
    };
  };

  const upd = (empId, field, val) =>
    setYearEndData(prev => ({ ...prev, [empId]: { ...(prev[empId]||{}), [field]: val } }));

  const d = yearEndData[selectedEmpId] || {};
  const result = selectedEmpId ? calcYearEnd(selectedEmpId) : null;

  // 全員サマリー
  const allResults = employees.map(e => ({ emp: e, r: calcYearEnd(e.id) }));
  const totalRefund = allResults.reduce((s,{r})=> r && r.diff>0 ? s+r.diff : s, 0);
  const totalExtra  = allResults.reduce((s,{r})=> r && r.diff<0 ? s+Math.abs(r.diff) : s, 0);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h2 style={S.pageTitle}>年末調整</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select style={S.formInput} value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>
            {["2024","2023","2022"].map(y=><option key={y}>{y}</option>)}
          </select>
          <span style={{fontSize:12,color:"#888"}}>年分</span>
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #ddd"}}>
            {[["list","一覧"],["input","申告入力"],["result","計算結果"]].map(([v,l])=>(
              <button key={v} style={{padding:"7px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:view===v?700:400,background:view===v?"#6c63ff":"white",color:view===v?"white":"#666"}} onClick={()=>setView(v)}>{l}</button>
            ))}
          </div>
          <button style={S.secondaryBtn} onClick={()=>printGensenchousho(employees,allResults,selectedYear,settings)}>📋 源泉徴収簿</button>
        </div>
      </div>

      {/* サマリーカード */}
      <div style={S.statsGrid}>
        {[
          {label:"対象従業員",   value:`${employees.length}名`,      color:"#6c63ff"},
          {label:"還付合計",     value:`¥${fmt(totalRefund)}`,       color:"#00c9a7"},
          {label:"追加徴収合計", value:`¥${fmt(totalExtra)}`,        color:"#fc5c65"},
          {label:"対象年",       value:`${selectedYear}年分`,         color:"#f7b731"},
        ].map(s=>(
          <div key={s.label} style={{...S.statCard,borderTopColor:s.color}}>
            <div style={{...S.statValue,color:s.color,fontSize:18}}>{s.value}</div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 一覧ビュー */}
      {view==="list" && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>{["コード","氏名","年間総支給","社保控除","徴収済税額","年税額","過不足","ステータス","操作"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {allResults.map(({emp:e,r})=>(
                <tr key={e.id} style={S.tr}>
                  <td style={{...S.td,fontSize:11,fontFamily:"monospace",color:"#888"}}>{e.code||"—"}</td>
                  <td style={{...S.td,fontWeight:600}}>{e.name}</td>
                  <td style={S.td}>¥{fmt(r?.totalGross)}</td>
                  <td style={S.td}>¥{fmt(r?.shakaihoken)}</td>
                  <td style={S.td}>¥{fmt(r?.totalWithheld)}</td>
                  <td style={{...S.td,fontWeight:700}}>¥{fmt(r?.finalTax)}</td>
                  <td style={{...S.td,fontWeight:700,color:r?.diff>0?"#00c9a7":r?.diff<0?"#fc5c65":"#333"}}>
                    {r?.diff>0?`還付 ¥${fmt(r.diff)}`:r?.diff<0?`徴収 ¥${fmt(Math.abs(r.diff))}`:"±0"}
                  </td>
                  <td style={S.td}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:600,
                      background:yearEndData[e.id]?"#e8f8f0":"#fff3e0",
                      color:yearEndData[e.id]?"#2e7d32":"#e07000"}}>
                      {yearEndData[e.id]?"申告済":"未入力"}
                    </span>
                  </td>
                  <td style={S.td}>
                    <button style={S.editBtn} onClick={()=>{setSelectedEmpId(e.id);setView("input");}}>入力</button>
                    <button style={{...S.editBtn,color:"#00c9a7",borderColor:"#00c9a7"}} onClick={()=>{setSelectedEmpId(e.id);setView("result");}}>結果</button>
                    {yearEndData[e.id]&&<button style={{...S.editBtn,color:"#6c63ff",borderColor:"#6c63ff",fontSize:10}} onClick={()=>{const r=calcYearEnd(e.id);if(r)printGensenhyou(e,r,selectedYear,settings);}}>票</button>}
                    {e.retireDate&&<button style={{...S.editBtn,color:"#fc5c65",borderColor:"#fc5c65",fontSize:10}} onClick={()=>{const amt=Number(prompt(`${e.name}の退職手当等の支払金額（円）`));if(amt>0)printRetirementHyou(e,amt,settings);}}>退職票</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 申告入力ビュー */}
      {view==="input" && emp && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            <select style={{...S.formInput,width:"auto"}} value={selectedEmpId} onChange={e=>setSelectedEmpId(Number(e.target.value))}>
              {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:''}{e.name}</option>)}
            </select>
            <span style={{fontSize:12,color:"#888"}}>の申告内容を入力</span>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

            {/* 配偶者 */}
            <YESection title="👫 配偶者">
              <YECheck label="配偶者あり" checked={d.hasSpouse||false} onChange={v=>upd(selectedEmpId,"hasSpouse",v)}/>
              {d.hasSpouse && <YENum label="配偶者の年収（円）" value={d.spouseIncome||0} onChange={v=>upd(selectedEmpId,"spouseIncome",v)}/>}
            </YESection>

            {/* 扶養 */}
            <YESection title="👨‍👩‍👧 扶養控除">
              <YENum label="一般扶養人数（16〜22・23〜69歳）" value={d.dep_general||0} onChange={v=>upd(selectedEmpId,"dep_general",v)} isInt/>
              <YENum label="特定扶養人数（19〜22歳）" value={d.dep_specific||0} onChange={v=>upd(selectedEmpId,"dep_specific",v)} isInt/>
              <YENum label="老人扶養人数（70歳以上）" value={d.dep_elderly||0} onChange={v=>upd(selectedEmpId,"dep_elderly",v)} isInt/>
              <YENum label="同居老親等人数" value={d.dep_elive||0} onChange={v=>upd(selectedEmpId,"dep_elive",v)} isInt/>
            </YESection>

            {/* 生命保険料 */}
            <YESection title="🛡 生命保険料控除（新制度）">
              <YENum label="一般生命保険料（支払額）" value={d.seimei_new_life||0} onChange={v=>upd(selectedEmpId,"seimei_new_life",v)}/>
              <YENum label="介護医療保険料（支払額）" value={d.seimei_new_care||0} onChange={v=>upd(selectedEmpId,"seimei_new_care",v)}/>
              <YENum label="個人年金保険料（支払額）" value={d.seimei_new_annuity||0} onChange={v=>upd(selectedEmpId,"seimei_new_annuity",v)}/>
            </YESection>

            {/* 地震保険 */}
            <YESection title="🏠 地震保険料控除">
              <YENum label="地震保険料（支払額）" value={d.jishinHoken||0} onChange={v=>upd(selectedEmpId,"jishinHoken",v)}/>
            </YESection>

            {/* 住宅借入金 */}
            <YESection title="🏡 住宅借入金等特別控除">
              <YENum label="住宅ローン控除額（税額控除）" value={d.jutakuKojo||0} onChange={v=>upd(selectedEmpId,"jutakuKojo",v)}/>
              <div style={{fontSize:11,color:"#aaa",marginTop:4}}>※ 住宅ローン控除証明書の「控除額」をそのまま入力</div>
            </YESection>

            {/* 障害者 */}
            <YESection title="♿ 障害者控除">
              <YENum label="一般障害者人数" value={d.shogai_general||0} onChange={v=>upd(selectedEmpId,"shogai_general",v)} isInt/>
              <YENum label="特別障害者人数" value={d.shogai_special||0} onChange={v=>upd(selectedEmpId,"shogai_special",v)} isInt/>
              <YENum label="同居特別障害者人数" value={d.shogai_live||0} onChange={v=>upd(selectedEmpId,"shogai_live",v)} isInt/>
            </YESection>

            {/* その他 */}
            <YESection title="📋 その他の控除">
              <YECheck label="寡婦控除" checked={d.kabufu||false} onChange={v=>upd(selectedEmpId,"kabufu",v)}/>
              <YECheck label="ひとり親控除" checked={d.hitorioyan||false} onChange={v=>upd(selectedEmpId,"hitorioyan",v)}/>
              <YECheck label="勤労学生控除" checked={d.kinroGakusei||false} onChange={v=>upd(selectedEmpId,"kinroGakusei",v)}/>
              <YENum label="小規模企業共済等掛金（円）" value={d.shoukibo||0} onChange={v=>upd(selectedEmpId,"shoukibo",v)}/>
            </YESection>

            {/* 自動集計 */}
            {result && (
              <YESection title="📊 自動集計（月次データより）">
                <div style={{fontSize:12,color:"#666",lineHeight:2}}>
                  <div>給与年間総支給：<b>¥{fmt(result.salaryGross||result.totalGross)}</b></div>
                  {result.bonusGross>0&&<div style={{color:"#f7b731"}}>賞与年間総支給：<b>¥{fmt(result.bonusGross)}</b></div>}
                  <div style={{fontWeight:700}}>年収合計（給与＋賞与）：<b>¥{fmt(result.totalGross)}</b></div>
                  <div>社会保険料控除（自動）：<b>¥{fmt(result.shakaihoken)}</b></div>
                  <div>徴収済み源泉税：<b>¥{fmt(result.totalWithheld)}</b></div>
                </div>
              </YESection>
            )}
          </div>

          <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button style={S.primaryBtn} onClick={()=>setView("result")}>計算結果を見る →</button>
          </div>
        </div>
      )}

      {/* 計算結果ビュー */}
      {view==="result" && emp && result && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            <select style={{...S.formInput,width:"auto"}} value={selectedEmpId} onChange={e=>setSelectedEmpId(Number(e.target.value))}>
              {employees.map(e=><option key={e.id} value={e.id}>{e.code?`[${e.code}] `:''}{e.name}</option>)}
            </select>
            <span style={{fontSize:12,color:"#888"}}>の年末調整計算結果</span>
            <button style={S.secondaryBtn} onClick={()=>setView("input")}>← 申告入力に戻る</button>
            {result&&<button style={S.primaryBtn} onClick={()=>printGensenhyou(emp,result,selectedYear,settings)}>📄 源泉徴収票</button>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* 収入・給与所得 */}
            <div style={S.card}>
              <div style={S.sectionHeader}>収入・給与所得</div>
              {[
                ["年間総支給額（収入金額）", result.totalGross],
                ["給与所得控除額",           result.totalGross - result.kyuyoShotoku],
                ["給与所得金額",             result.kyuyoShotoku],
              ].map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={S.payslipRowValue}>¥{fmt(v)}</span>
                </div>
              ))}
            </div>

            {/* 所得控除 */}
            <div style={S.card}>
              <div style={S.sectionHeader}>所得控除</div>
              {[
                ["社会保険料控除",   result.shakaihoken],
                ["基礎控除",         result.kisoKojo],
                ["配偶者（特別）控除",result.haiguKojo],
                ["扶養控除",         result.fuyo],
                ["生命保険料控除",   result.seimeiKojo],
                ["地震保険料控除",   result.jishin],
                ["障害者控除",       result.shogaiKojo],
                ["寡婦・ひとり親控除",result.kabufuKojo+result.hitorioyanKojo],
                ["勤労学生控除",     result.kinroGakusei],
                ["小規模企業共済等", result.shoukibo],
              ].filter(([,v])=>v>0).map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={S.payslipRowValue}>¥{fmt(v)}</span>
                </div>
              ))}
              <div style={{...S.payslipRow,borderTop:"2px solid #1a1a2e",fontWeight:700}}>
                <span>所得控除合計</span>
                <span style={{color:"#6c63ff"}}>¥{fmt(result.totalKojo)}</span>
              </div>
            </div>

            {/* 税額計算 */}
            <div style={S.card}>
              <div style={S.sectionHeader}>税額計算</div>
              {[
                ["課税所得金額",              result.kazeiShotoku],
                ["算出税額",                  result.nenZei],
                ["住宅借入金等特別控除",      -(result.jutakuKojo||0)],
                ["年税額（復興特別所得税込）", result.finalTax],
              ].map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={{...S.payslipRowValue,color:l.startsWith("課税")?"#333":l.startsWith("住宅")?"#00c9a7":"#333"}}>
                    {v<0?`- ¥${fmt(Math.abs(v))}`:`¥${fmt(v)}`}
                  </span>
                </div>
              ))}
            </div>

            {/* 過不足 */}
            <div style={{...S.card,border:`2px solid ${result.diff>=0?"#00c9a7":"#fc5c65"}`}}>
              <div style={{...S.sectionHeader,color:result.diff>=0?"#00c9a7":"#fc5c65",borderBottomColor:result.diff>=0?"#00c9a7":"#fc5c65"}}>
                {result.diff>=0?"💚 還付":"🔴 追加徴収"}
              </div>
              {[
                ["徴収済み源泉税合計",  result.totalWithheld],
                ["確定年税額",          result.finalTax],
              ].map(([l,v])=>(
                <div key={l} style={S.payslipRow}>
                  <span style={S.payslipRowLabel}>{l}</span>
                  <span style={S.payslipRowValue}>¥{fmt(v)}</span>
                </div>
              ))}
              <div style={{marginTop:12,padding:"12px 16px",background:result.diff>=0?"#e8faf5":"#fff0f0",borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:result.diff>=0?"#00c9a7":"#fc5c65"}}>
                  {result.diff>=0?"還付金額":"追加徴収額"}
                </span>
                <span style={{fontSize:22,fontWeight:900,color:result.diff>=0?"#00c9a7":"#fc5c65"}}>
                  ¥{fmt(Math.abs(result.diff))}
                </span>
              </div>
              <div style={{fontSize:11,color:"#888",marginTop:8,textAlign:"center"}}>
                {result.diff>=0?"12月給与または別途で還付してください":"12月給与から追加徴収してください"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 年末調整用 小コンポーネント
function YESection({ title, children }) {
  return (
    <div style={{...S.card,padding:"14px 16px"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#1a1a2e",borderBottom:"2px solid #6c63ff",paddingBottom:6,marginBottom:10}}>{title}</div>
      {children}
    </div>
  );
}
function YECheck({ label, checked, onChange }) {
  return (
    <label style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",cursor:"pointer",fontSize:13}}>
      <input type="checkbox" style={{accentColor:"#6c63ff",width:16,height:16}} checked={checked} onChange={e=>onChange(e.target.checked)}/>
      {label}
    </label>
  );
}
function YENum({ label, value, onChange, isInt }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:"1px dotted #eee"}}>
      <span style={{fontSize:12,color:"#555",flex:1}}>{label}</span>
      <input
        style={{...S.formInput,width:isInt?60:110,padding:"3px 8px",fontSize:12,textAlign:"right"}}
        type="number" min="0" step={isInt?1:1000}
        value={value||""}
        placeholder="0"
        onChange={e=>onChange(isInt?Math.floor(Number(e.target.value)):Number(e.target.value))}
      />
    </div>
  );
}

export default YearEndAdj;
