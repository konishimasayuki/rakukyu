import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calcPayroll, calcBonusAmount, calcSocialInsurance, fmt } from "../utils/calcPayroll";
import S from "../utils/styles";
function LoginScreen({ loginId,setLoginId,loginPw,setLoginPw,loginError,onLogin }) {
  return (
    <div style={S.loginBg}>
      <div style={S.loginCard}>
                <div style={S.loginLogo}>楽</div>
        <h1 style={S.loginTitle}>楽給.com</h1>
        <p style={S.loginSub}>給与計算システム</p>
        <div style={S.loginField}><label style={S.loginLabel}>会社ID</label><input style={S.loginInput} value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="例: a"/></div>
        <div style={S.loginField}><label style={S.loginLabel}>パスワード</label><input style={S.loginInput} type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin()}/></div>
        {loginError && <div style={S.loginError}>{loginError}</div>}
        <button style={S.loginBtn} onClick={onLogin}>ログイン</button>
        <div style={S.loginHint}><div>クイックデモ: <b>a</b> / <b>a</b></div><div style={{marginTop:4,fontSize:10}}>他: carsera/carsera123　engine/engine123</div></div>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS TAB

export default LoginScreen;
