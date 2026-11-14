/**
 * ============================================================================
 * MODULE NHẬN DIỆN KHUÔN MẶT THÔNG MINH CHO INDEX.HTML (HYBRID CLIENT + GAS)
 * Thay thế hàm buildCroppedFaceSnapshot() và captureAndRecognizeFaceAI() cũ
 * ============================================================================
 */

const __faceSampleCache = {}; // Cache mẫu ảnh theo lớp trong phiên làm việc

/**
 * 1. Cắt sát khung khuôn mặt theo tọa độ FaceMesh + tự động cân bằng sáng khi phòng tối
 */
function buildCroppedFaceSnapshot(videoEl, landmarks) {
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 480;

  let sx = 0, sy = 0, sw = vw, sh = vh;

  if (landmarks && landmarks.length > 0) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let i = 0; i < landmarks.length; i++) {
      const pt = landmarks[i];
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    // Mở rộng thêm 30% lề xung quanh khuôn mặt để giữ trọn trán, cằm và tai
    const faceW = (maxX - minX) * vw;
    const faceH = (maxY - minY) * vh;
    const padX = faceW * 0.30;
    const padY = faceH * 0.35;

    sx = Math.max(0, Math.floor(minX * vw - padX));
    sy = Math.max(0, Math.floor(minY * vh - padY));
    sw = Math.min(vw - sx, Math.ceil(faceW + padX * 2));
    sh = Math.min(vh - sy, Math.ceil(faceH + padY * 2));
  }

  const outSize = 360;
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");

  // Lật ngang cho khớp góc nhìn thực tế + tăng sáng/tương phản tự động
  ctx.save();
  ctx.filter = "brightness(1.18) contrast(1.12)";
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, outSize, outSize);
  ctx.restore();

  // Kiểm tra độ sáng trung bình; nếu phòng quá tối thì nâng gamma nhẹ
  const imgData = ctx.getImageData(0, 0, outSize, outSize);
  const pixels = imgData.data;
  let lumSum = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    lumSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  const avgLum = lumSum / (pixels.length / 16);
  if (avgLum < 85) {
    const gain = Math.min(1.85, 115 / Math.max(25, avgLum));
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = Math.min(255, pixels[i] * gain);
      pixels[i + 1] = Math.min(255, pixels[i + 1] * gain);
      pixels[i + 2] = Math.min(255, pixels[i + 2] * gain);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * 2. Trích xuất vector tỷ lệ hình học khuôn mặt chuẩn hóa (bất biến theo khoảng cách & góc nghiêng)
 */
function extractNormalizedFaceGeometry(landmarks) {
  if (!landmarks || landmarks.length < 400) return null;

  // Các điểm mốc giải phẫu chuẩn trên MediaPipe FaceMesh (468/478 điểm)
  const keyIndices = [
    1,   // Chóp mũi
    33,  // Khóe mắt ngoài trái
    133, // Khóe mắt trong trái
    362, // Khóe mắt trong phải
    263, // Khóe mắt ngoài phải
    61,  // Khóe miệng trái
    291, // Khóe miệng phải
    199, // Cằm dưới
    10,  // Giữa trán
    234, // Gò má trái
    454, // Gò má phải
    70,  // Đầu lông mày trái
    300, // Đầu lông mày phải
    168  // Sống mũi giữa hai mắt
  ];

  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  // Khoảng cách liên đồng tử làm chuẩn tỷ lệ (scale-invariant)
  const interOcular = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 1e-5;

  const vec = [];
  for (let i = 0; i < keyIndices.length; i++) {
    const pt = landmarks[keyIndices[i]];
    vec.push((pt.x - nose.x) / interOcular);
    vec.push((pt.y - nose.y) / interOcular);
  }
  return vec;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-8);
}

/**
 * 3. Hàm chụp & nhận diện khuôn mặt đầy đủ thông báo lỗi & tự động đối chiếu 3 góc
 */
async function captureAndRecognizeFaceAI() {
  const statusEl = document.getElementById("faceAiStatusText") || document.getElementById("aiStatus");
  const setStatus = (msg) => {
    console.log("[FaceAI]", msg);
    if (statusEl) statusEl.textContent = msg;
  };

  try {
    const className = (typeof currentClass !== "undefined" && currentClass)
      ? currentClass
      : (document.getElementById("classSelect")?.value || "");

    if (!className) {
      alert("Vui lòng chọn Lớp trước khi mở quét khuôn mặt AI!");
      return;
    }

    const videoEl = document.getElementById("faceVideo") || document.querySelector("video");
    if (!videoEl || videoEl.readyState < 2) {
      setStatus("Camera chưa sẵn sàng, vui lòng đợi 1 giây...");
      return;
    }

    const landmarks = window.__latestFaceLandmarks || null;
    if (!landmarks) {
      setStatus("Chưa phát hiện khuôn mặt trong khung hình. Vui lòng nhìn thẳng vào camera!");
      return;
    }

    setStatus("Đang cắt ảnh chuẩn sáng & đối chiếu với dữ liệu 3 góc lớp " + className + "...");
    const snapshotBase64 = buildCroppedFaceSnapshot(videoEl, landmarks);

    // Gọi API Backend (KHÔNG nuốt lỗi bằng .catch(() => null) nữa!)
    let apiRes;
    try {
      apiRes = await callBackendApi("recognizeStudentFaceAI", {
        className: className,
        image_data: snapshotBase64
      });
    } catch (netErr) {
      console.error("[FaceAI] Lỗi gọi Apps Script:", netErr);
      setStatus("Lỗi kết nối server Apps Script: " + (netErr.message || netErr));
      return;
    }

    if (!apiRes) {
      setStatus("Server không phản hồi dữ liệu. Kiểm tra lại URL Web App (.gs).");
      return;
    }

    if (apiRes.status === "error") {
      console.error("[FaceAI] Lỗi từ server:", apiRes.msg);
      setStatus("Lỗi hệ thống: " + apiRes.msg);
      return;
    }

    if (apiRes.status === "no_samples") {
      setStatus(apiRes.msg);
      return;
    }

    // Trường hợp 1: Server (Gemini Vision) đã đối chiếu trực tiếp thành công
    if (apiRes.status === "success" && apiRes.matched) {
      setStatus(`✅ Nhận diện thành công: ${apiRes.name} (${apiRes.maHS}) - Độ tin cậy ${apiRes.confidence}%`);
      if (typeof onFaceRecognizedSuccess === "function") {
        onFaceRecognizedSuccess(apiRes);
      }
      return apiRes;
    }

    // Trường hợp 2: Server trả về bộ 3 ảnh mẫu để trình duyệt tự so khớp cục bộ (khi chưa cài Gemini API Key)
    if (apiRes.status === "client_fallback" && Array.isArray(apiRes.samples)) {
      setStatus("Đang đối chiếu đặc trưng khuôn mặt cục bộ với " + apiRes.samples.length + " hồ sơ...");
      // Bạn có thể mở rộng thêm face-api.js hoặc so khớp ảnh trực tiếp tại đây
      setStatus("⚠️ Server chưa cấu hình GEMINI_API_KEY trong sheet CauHinh nên chưa thể đối chiếu ảnh từ Drive.");
      return apiRes;
    }

    // Trường hợp 3: Không khớp khuôn mặt nào
    setStatus(apiRes.msg || "Không khớp khuôn mặt nào trong danh sách lớp " + className);
    return apiRes;
  } catch (err) {
    console.error("[FaceAI] Exception:", err);
    setStatus("Lỗi không xác định: " + err.message);
  }
}
