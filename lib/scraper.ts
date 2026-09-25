export interface ViewSourceResult {
  status: boolean;
  data?: { result: string };
  message?: unknown;
}

export async function shorten(url: string): Promise<string> {
  const res = await fetch("https://tinyurl.com/api-create.php?url=" + encodeURIComponent(url));
  if (!res.ok) throw new Error("Shorten failed: HTTP " + res.status);
  return (await res.text()).trim();
}

export async function upload(buffer: Buffer, filename?: string): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", new Blob([buffer as BlobPart]), filename || "file_" + Date.now());
  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed: HTTP " + res.status);
  return (await res.text()).trim();
}

export async function viewSource(url: string): Promise<ViewSourceResult> {
  try {
    const res = await fetch("https://viewsourcepage.com/wp-admin/admin-ajax.php", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      },
      body: new URLSearchParams({ action: "psvAjaxAction", url }).toString()
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return { status: true, data: { result: await res.text() } };
  } catch (e) {
    return { status: false, message: (e as Error)?.message || e };
  }
}
