/**
 * ============================================================================
 * MODULE CHUẨN HÓA THU THẬP 3 GÓC MẶT CHO AI.HTML (Index_thuthapanhAI.html)
 * Đảm bảo ảnh gửi lên Drive luôn cắt sát mặt, sáng rõ, đúng định dạng 3 mẫu
 * ============================================================================
 */

async function uploadThreeFaceSamplesToDrive({ webAppUrl, className, ma_hs, ten_hs, samples }) {
  if (!className || !ma_hs || !ten_hs) {
    throw new Error("Thiếu thông tin Lớp, Mã HS hoặc Họ tên học sinh!");
  }
  if (!Array.isArray(samples) || samples.length < 3) {
    throw new Error("Cần chụp đủ 3 góc khuôn mặt (Chính diện, Nghiêng trái, Nghiêng phải)!");
  }

  const payload = {
    action: "aiUploadToServerMulti",
    className: String(className).trim().toUpperCase().replace(/\s+/g, ''),
    ma_hs: String(ma_hs).trim(),
    ten_hs: String(ten_hs).trim(),
    samples: samples
  };

  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error("Phản hồi từ Apps Script không hợp lệ: " + text.slice(0, 200));
  }

  if (result.status !== "success") {
    throw new Error(result.msg || "Lưu bộ 3 ảnh lên Drive thất bại!");
  }
  return result;
}
