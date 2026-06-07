// モバイルCSS注入コンポーネント
// MOBILE CSS INJECTION
// ============================================================
function MobileCSS() {
  // viewportメタタグを動的に設定（スマホ拡大防止）
  if (typeof document !== "undefined") {
    let vp = document.querySelector("meta[name=viewport]");
    if (!vp) { vp = document.createElement("meta"); vp.name="viewport"; document.head.appendChild(vp); }
    vp.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  }
  return (
    <style>{`
      .rakukyu-sidebar {
        position: fixed !important;
        top: 0; left: 0; height: 100vh;
        z-index: 100;
        transform: translateX(0);
        transition: transform 0.25s ease;
      }
      .rakukyu-sidebar.hidden {
        transform: translateX(-100%);
      }
      .rakukyu-mobile-header { display: none !important; }
      @media (max-width: 768px) {
        .rakukyu-mobile-header { display: flex !important; }
        .rakukyu-sidebar { transform: translateX(-100%); }
        .rakukyu-sidebar.open { transform: translateX(0) !important; }
        .rakukyu-main-wrap { margin-left: 0 !important; }
      }
      @media (min-width: 769px) {
        .rakukyu-sidebar { position: relative !important; transform: none !important; }
        .rakukyu-overlay { display: none !important; }
      }
    `}</style>
  );
}

// ============================================================
// LOGIN
// ============================================================

export default MobileCSS;
