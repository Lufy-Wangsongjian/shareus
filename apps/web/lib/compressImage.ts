const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片压缩失败"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function compressLoadedImage(image: HTMLImageElement): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法处理图片");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
}

export async function compressImageFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  const image = await loadImageFromFile(file);
  return compressLoadedImage(image);
}

export async function compressImageBlob(blob: Blob): Promise<Blob> {
  const file = new File([blob], "paste.jpg", { type: blob.type || "image/jpeg" });
  return compressImageFile(file);
}
