const APP_CONFIG = {
  version: "3.4.0",
  buildDate: "2026-11-08",
  appName: "Hệ thống Điểm danh THPT Ngô Quyền"
};

// Tự động kiểm tra và làm mới Cache khi có bản cập nhật trên GitHub Pages
async function checkSystemUpdate() {
  try {
    const response = await fetch('version.json?t=' + new Date().getTime(), { cache: 'no-store' });
    if (response.ok) {
      const serverData = await response.json();
      const localVersion = localStorage.getItem('ngo_quyen_app_version');
      
      if (localVersion && localVersion !== serverData.version) {
        console.log(`[Auto-Update] Đã phát hiện phiên bản mới: ${serverData.version}. Đang cập nhật...`);
        localStorage.setItem('ngo_quyen_app_version', serverData.version);
        
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (let registration of registrations) {
            await registration.unregister();
          }
        }
        
        window.location.reload(true);
      } else {
        localStorage.setItem('ngo_quyen_app_version', serverData.version);
      }
    }
  } catch (err) {
    console.warn("[Auto-Update] Không thể kiểm tra phiên bản:", err);
  }
}

checkSystemUpdate();
