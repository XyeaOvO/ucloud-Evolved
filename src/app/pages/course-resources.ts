// @ts-nocheck
import { CONSTANTS } from "../../constants";
import { API } from "../../core/api";
import { LOG } from "../../core/logger";
import { DownloadManager } from "../../services/download-manager";
import { NotificationManager } from "../../services/notification-manager";
import { Settings } from "../../settings";
import { Utils } from "../../utils";

declare function GM_download(options: {
  url: string;
  name: string;
  saveAs?: boolean | string;
  onprogress?: (event: {
    loaded: number;
    total: number;
    lengthComputable: boolean;
  }) => void;
  onload?: () => void;
  onerror?: (error: Record<string, unknown>) => void;
}): unknown;

type ResourceIdentifier = string | number | null | undefined;

export interface CourseResource {
  id?: ResourceIdentifier;
  resourceId?: ResourceIdentifier;
  storageId?: ResourceIdentifier;
  attachmentId?: ResourceIdentifier;
  storage?: { id?: ResourceIdentifier } | null;
  name?: string | null;
  resourceName?: string | null;
  fileName?: string | null;
  path?: string | null;
}

interface ResolvedResource {
  resource: CourseResource;
  previewEl: HTMLElement | null;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "未知错误");

export interface CourseResourceContext {
  downloadManager: DownloadManager;
  isBatchDownloading(): boolean;
  setBatchDownloading(active: boolean): void;
  getCurrentCourseTitle(): string;
}

export async function setupCourseResources(
  context: CourseResourceContext,
  resources: CourseResource[]
): Promise<void> {
  if (!resources.length) return;

  const resourceItems = Utils.$x(CONSTANTS.SELECTORS.resourceItems).filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
  const previewItems = Utils.$x(CONSTANTS.SELECTORS.previewItems).filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );

  if (!resourceItems.length) return;

  const courseName = context.getCurrentCourseTitle();

  const getResourceId = (res: CourseResource | null | undefined): string | null => {
    if (!res) return null;
    const storageIdCandidate =
      res.storage && typeof res.storage === "object"
        ? ((res.storage as { id?: ResourceIdentifier }).id ?? null)
        : null;
    const candidates: ResourceIdentifier[] = [
      res.id,
      res.resourceId,
      res.storageId,
      res.attachmentId,
      storageIdCandidate,
    ];
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null && candidate !== "") {
        return String(candidate);
      }
    }
    return null;
  };

  const resourceById = new Map<string, CourseResource>();
  const resourceNameBuckets = new Map<string, CourseResource[]>();
  resources.forEach((res) => {
    const id = getResourceId(res);
    if (id) resourceById.set(id, res);
    const normalizedName = Utils.normalizeText(res.name || res.resourceName || res.fileName);
    if (normalizedName) {
      if (!resourceNameBuckets.has(normalizedName)) resourceNameBuckets.set(normalizedName, []);
      resourceNameBuckets.get(normalizedName)!.push(res);
    }
  });

  const usedResources = new Set<CourseResource>();
  const idAttrRegex = /(resource|storage).*id/i;
  const idCandidateCache = new WeakMap<Element, Set<string>>();
  const nameCandidateCache = new WeakMap<Element | null, Set<string>>();
  const nameSelectorList = [".resource-name", ".name", "a", "span", "p", "[title]"];
  const nameSelectorUnion = nameSelectorList.join(",");

  const collectIdCandidates = (root: Element | null): Set<string> => {
    if (!root || !(root instanceof Element)) return new Set();
    if (idCandidateCache.has(root)) return idCandidateCache.get(root)!;
    const out = new Set<string>();
    const stack: Element[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.dataset) {
        Object.entries(node.dataset).forEach(([key, value]) => {
          if (!value) return;
          if (idAttrRegex.test(key) || key === "id") {
            out.add(String(value).trim());
          }
        });
      }
      Array.from(node.attributes || []).forEach((attr) => {
        const value = attr?.value;
        if (!value) return;
        if (idAttrRegex.test(attr.name) || attr.name === "data-id") {
          out.add(String(value).trim());
        }
        if (attr.name === "href") {
          const match = value.match(/(?:resource|storage)Id=([^&]+)/i);
          if (match && match[1]) out.add(match[1].trim());
        }
      });
      if (node.children && node.children.length) {
        for (let i = node.children.length - 1; i >= 0; i -= 1) {
          const child = node.children[i];
          if (child instanceof Element) stack.push(child);
        }
      }
    }
    idCandidateCache.set(root, out);
    return out;
  };

  const collectNameCandidates = (root: Element | null): Set<string> => {
    if (!root) return new Set();
    if (nameCandidateCache.has(root)) return nameCandidateCache.get(root)!;
    const out = new Set<string>();
    const push = (text: unknown) => {
      const normalized = Utils.normalizeText(text);
      if (normalized) out.add(normalized);
    };
    if (root instanceof Element) {
      const title = root.getAttribute?.("title");
      if (title) push(title);
      if (typeof root.textContent === "string") {
        push(root.textContent);
      }
      if (typeof root.querySelectorAll === "function") {
        try {
          root.querySelectorAll(nameSelectorUnion).forEach((node) => {
            const nodeTitle = node.getAttribute?.("title");
            if (nodeTitle) push(nodeTitle);
            if (typeof node.textContent === "string") push(node.textContent);
          });
        } catch {
          // ignore selector errors
        }
      }
    } else if (root && typeof root.textContent === "string") {
      push(root.textContent);
    }
    nameCandidateCache.set(root, out);
    return out;
  };

  const previewLookup = new Map<string, HTMLElement>();
  previewItems.forEach((previewEl) => {
    collectIdCandidates(previewEl).forEach((id) => {
      if (id && !previewLookup.has(id)) {
        previewLookup.set(id, previewEl);
      }
    });
  });

  const takeResourceFromBucket = (name: string): CourseResource | null => {
    const bucket = resourceNameBuckets.get(name);
    if (!bucket || bucket.length === 0) return null;
    const idx = bucket.findIndex((res) => !usedResources.has(res));
    if (idx === -1) return null;
    const [picked] = bucket.splice(idx, 1);
    return picked;
  };

  const resolveResourceForElement = (
    element: HTMLElement,
    fallbackIndex: number
  ): ResolvedResource | null => {
    const fallbackPreview = previewItems[fallbackIndex] || null;
    const idCandidates = new Set<string>([
      ...collectIdCandidates(element),
      ...collectIdCandidates(fallbackPreview),
    ]);

    for (const rawId of idCandidates) {
      const id = rawId?.trim();
      if (!id) continue;
      const res = resourceById.get(id);
      if (res && !usedResources.has(res)) {
        resourceById.delete(id);
        usedResources.add(res);
        const previewEl = previewLookup.get(id) || fallbackPreview;
        return { resource: res, previewEl };
      }
    }

    const nameCandidates = new Set<string>([
      ...collectNameCandidates(element),
      ...collectNameCandidates(fallbackPreview),
    ]);
    for (const name of nameCandidates) {
      const res = takeResourceFromBucket(name);
      if (res && !usedResources.has(res)) {
        usedResources.add(res);
        const resId = getResourceId(res);
        const previewEl = resId ? (previewLookup.get(resId) || fallbackPreview) : fallbackPreview;
        return { resource: res, previewEl };
      }
    }

    const fallbackResource = resources[fallbackIndex];
    if (fallbackResource && !usedResources.has(fallbackResource)) {
      usedResources.add(fallbackResource);
      const resId = getResourceId(fallbackResource);
      const previewEl = resId ? (previewLookup.get(resId) || fallbackPreview) : fallbackPreview;
      return { resource: fallbackResource, previewEl };
    }

    return null;
  };

  resourceItems.forEach((element, index) => {
    const resolved = resolveResourceForElement(element, index);
    if (!resolved) {
      LOG.warnThrottled(
        "resource-resolve",
        "未能为资源项匹配对应的数据，可能导致按钮缺失。"
      );
      return;
    }

    const { resource, previewEl } = resolved;
    const resourceId = getResourceId(resource);
    if (resourceId) {
      element.dataset.uepResourceId = resourceId;
      if (previewEl) {
        previewEl.dataset.uepResourceId = resourceId;
      }
    }

    const rawName =
      resource?.name || resource?.resourceName || resource?.fileName || `文件_${index + 1}`;
    const downloadName = resolveSingleFileName(rawName, courseName, `文件_${index + 1}`);

    if (
      Settings.get("preview", "autoDownload") &&
      previewEl &&
      !previewEl.dataset.uepAutoDownloadBound
    ) {
      previewEl.dataset.uepAutoDownloadBound = "1";
      previewEl.addEventListener(
        "click",
        async () => {
          if (!resourceId) return;
          try {
            const { previewUrl } = await API.getPreviewURL(resourceId);
            await context.downloadManager.downloadFile(previewUrl, downloadName);
          } catch (error) {
            LOG.error("Auto download error:", error);
          }
        },
        false
      );
    }

    if (
      Settings.get("course", "showAllDownloadButton") &&
      !element.dataset.uepDownloadButtonBound
    ) {
      element.dataset.uepDownloadButtonBound = "1";
      addDownloadButton(context, element, resource, index, downloadName);
    }
  });

  const oldAllBtn = document.getElementById("downloadAllButton");
  if (oldAllBtn) {
    const parent = oldAllBtn.parentElement;
    oldAllBtn.remove();
    if (parent && parent.childNodes.length === 0) parent.remove();
  }

  if (Settings.get("course", "addBatchDownload")) {
    addBatchDownloadButton(context, resources);
  }
}

export function resolveDownloadBasename(courseName?: string | null): string {
  const templateRaw = Settings.get("course", "downloadNameTemplate");
  const template =
    typeof templateRaw === "string" && templateRaw.trim().length
      ? templateRaw.trim()
      : "{{course}}-{{date}}";
  const fallbackCourse =
    courseName && String(courseName).trim() ? String(courseName).trim() : "课程资源";
  const timestamp = Utils.formatDateForFilename();
  const replacements: Record<string, string> = {
    course: fallbackCourse,
    date: timestamp,
    timestamp,
  };
  let resolved = template;
  Object.entries(replacements).forEach(([token, value]) => {
    const pattern = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "gi");
    resolved = resolved.replace(pattern, value);
  });
  resolved = resolved.replace(/\{\{[^}]+\}\}/g, "").trim();
  if (!resolved.length) {
    resolved = `${fallbackCourse}-${timestamp}`;
  }
  const sanitized = Utils.sanitizeFilename(resolved);
  return sanitized || "课程资源";
}

export function resolveZipFilename(courseName?: string | null): string {
  const base = resolveDownloadBasename(courseName);
  return base.toLowerCase().endsWith(".zip") ? base : `${base}.zip`;
}

export function resolveSingleFileName(
  resourceName: string | null | undefined,
  courseName?: string | null,
  fallback?: string
): string {
  const pickName = (...candidates: Array<string | null | undefined>): string => {
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed.length) {
          return trimmed;
        }
      }
    }
    return "file";
  };

  const rawName = pickName(resourceName, fallback);
  let sanitizedResource = Utils.sanitizeFilename(rawName);
  if (
    sanitizedResource === "file" &&
    typeof fallback === "string" &&
    fallback.trim().length &&
    fallback.trim() !== rawName
  ) {
    sanitizedResource = Utils.sanitizeFilename(fallback);
  }

  const base = resolveDownloadBasename(courseName);
  const prefix = base.replace(/\.zip$/i, "").trim() || base;
  if (!prefix.length) {
    return sanitizedResource;
  }

  const dotIndex = sanitizedResource.lastIndexOf(".");
  const namePart = dotIndex >= 0 ? sanitizedResource.slice(0, dotIndex) : sanitizedResource;
  const ext = dotIndex >= 0 ? sanitizedResource.slice(dotIndex) : "";
  const effectiveName = namePart.trim().length ? namePart : "file";
  const combined = [prefix, effectiveName].filter(Boolean).join("-");
  const sanitizedCombined = Utils.sanitizeFilename(combined);
  return ext ? `${sanitizedCombined}${ext}` : sanitizedCombined;
}

type ZipEntry = {
  name: string;
  relativePath: string;
  encodedPath: string;
  size: number;
};

interface ZipTreeNode {
  name: string;
  children: Map<string, ZipTreeNode>;
  files: ZipEntry[];
}

type JSZipConstructor = new () => JSZipInstance;

interface JSZipInstance {
  folder(name: string): JSZipInstance;
  file(name: string, data: BlobPart | ArrayBuffer): void;
  generateAsync(
    options: { type: "blob" },
    onUpdate?: (metadata: { percent?: number }) => void
  ): Promise<Blob>;
}

async function downloadResourcesAsZip(
  context: CourseResourceContext,
  resources: CourseResource[]
): Promise<"success" | "cancelled"> {
  const JSZip = (await Utils.ensureJSZip()) as JSZipConstructor;
  const zip = new JSZip();
  const courseName = context.getCurrentCourseTitle();
  const rootName = Utils.sanitizeFilename(courseName) || "课程资源";
  const rootFolder = zip.folder(rootName);
  const nameTracker = new Map<string, Set<string>>();
  const entries: ZipEntry[] = [];
  const downloadManager = context.downloadManager;
  const progress = downloadManager.ensureProgress();
  downloadManager.downloading = true;
  downloadManager.beginProgress();

  const total = resources.length || 1;
  let completed = 0;

  const updateProgress = (fraction: number) => {
    if (progress && typeof progress.set === "function") {
      progress.set(Math.min(0.9, Math.max(0, fraction)));
    }
  };

  try {
    for (let index = 0; index < resources.length; index++) {
      if (!context.isBatchDownloading()) throw new Error("用户取消");
      const resource = resources[index];
      const safeName = Utils.sanitizeFilename(
        resource.name || resource.resourceName || resource.fileName || `文件_${index + 1}`
      );
      const pathSegments = Utils.toPathSegments(resource.path ?? "");
      const folderKey = pathSegments.join("/") || ".";
      const finalName = dedupeFileName(folderKey, safeName, nameTracker);
      const relativeSegments = pathSegments.length ? [...pathSegments, finalName] : [finalName];

      const resourceId = getResourceId(resource);
      if (!resourceId) {
        LOG.warn("downloadResourcesAsZip: missing resource id", { resource });
        continue;
      }

      const { previewUrl } = await Utils.withRetry(() => API.getPreviewURL(resourceId), 3, 400);
      if (!context.isBatchDownloading()) throw new Error("用户取消");

      const buffer = await downloadManager.fetchBinary(previewUrl, {
        timeoutMs: 20000,
        onProgress: (loaded, totalBytes) => {
          if (!context.isBatchDownloading()) return;
          const fraction =
            totalBytes > 0
              ? (completed + Math.min(loaded / totalBytes, 1)) / total
              : (completed + 0.5) / total;
          updateProgress(fraction);
        },
      });

      if (!context.isBatchDownloading()) throw new Error("用户取消");

      const fileData: ArrayBuffer = buffer;
      const folder = pathSegments.reduce<JSZipInstance>(
        (acc, segment) => acc.folder(segment),
        rootFolder
      );
      folder.file(finalName, fileData);

      const size = fileData.byteLength;
      const relativePath = relativeSegments.join("/");
      entries.push({
        name: finalName,
        relativePath,
        encodedPath: Utils.encodePathSegments(relativeSegments),
        size,
      });

      completed += 1;
      updateProgress(completed / total);
    }

    const courseNameForIndex = context.getCurrentCourseTitle();
    rootFolder.file("index.html", buildZipIndexHtml(courseNameForIndex, entries));
    rootFolder.file(
      "metadata.json",
      JSON.stringify(
        {
          courseName: courseNameForIndex,
          generatedAt: new Date().toISOString(),
          files: entries,
        },
        null,
        2
      )
    );

    const blob = await zip.generateAsync({ type: "blob" }, (metadata) => {
      if (progress && typeof progress.set === "function") {
        const percent = typeof metadata?.percent === "number" ? metadata.percent : 0;
        const value = 0.9 + (percent / 100) * 0.1;
        progress.set(Math.min(1, value));
      }
    });

    const zipName = resolveZipFilename(courseNameForIndex);
    downloadManager.saveBlob(blob, zipName);
    NotificationManager.show("打包完成", `成功打包 ${entries.length} 个文件`);
    return "success";
  } catch (error: unknown) {
    const message = describeError(error);
    if (/取消/.test(message) || message === "下载已取消") {
      NotificationManager.show("已取消", "批量打包已停止", "info");
      return "cancelled";
    }
    LOG.error("Zip download error:", error);
    NotificationManager.show("打包失败", message || "未知错误", "error");
    throw error;
  } finally {
    downloadManager.resetTransferState();
  }
}

async function runLegacyBatchDownload(
  context: CourseResourceContext,
  resources: CourseResource[]
): Promise<"completed" | "cancelled"> {
  const downloadManager = context.downloadManager;
  const useGM = typeof GM_download === "function";
  let concurrency = Number(Settings.get("course", "downloadConcurrency"));
  if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 1;
  concurrency = Math.min(10, Math.floor(concurrency));
  let nextIndex = 0;
  const courseName = context.getCurrentCourseTitle();

  const fetchPreview = async (id: string) => {
    let attempt = 0;
    while (attempt < 3) {
      try {
        return await API.getPreviewURL(id);
      } catch (error) {
        attempt += 1;
        if (attempt >= 3) throw error;
        await Utils.sleep(300 * attempt);
      }
    }
    return { previewUrl: "" };
  };

  const worker = async () => {
    while (context.isBatchDownloading()) {
      const index = nextIndex++;
      if (index >= resources.length) return;
      const resource = resources[index];
      const downloadName = resolveSingleFileName(
        resource?.name || resource?.resourceName || resource?.fileName || `file_${index + 1}`,
        courseName,
        `file_${index + 1}`
      );

      let attempt = 0;
      const maxAttempts = 5;
      while (context.isBatchDownloading() && attempt < maxAttempts) {
        try {
          const resourceId = getResourceId(resource);
          if (!resourceId) {
            LOG.warn("runLegacyBatchDownload: missing resource id", { resource });
            break;
          }
          const { previewUrl } = await fetchPreview(resourceId);
          if (!context.isBatchDownloading()) return;
          if (useGM) {
            await downloadManager.downloadViaGM(previewUrl, downloadName, false);
          } else {
            await downloadManager.downloadFile(previewUrl, downloadName);
          }
          await Utils.sleep(300 + Math.random() * 400);
          break;
        } catch (error) {
          attempt += 1;
          LOG.error("Batch item download error:", error);
          if (attempt >= maxAttempts) break;
          await Utils.sleep(700 * attempt);
        }
      }
    }
  };

  try {
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    if (!context.isBatchDownloading()) {
      NotificationManager.show("已取消", "批量下载已停止", "info");
      return "cancelled";
    }
    return "completed";
  } catch (error) {
    LOG.error("Batch download error:", error);
    NotificationManager.show("批量下载失败", error?.message || "未知错误", "error");
    throw error;
  }
}

function addBatchDownloadButton(context: CourseResourceContext, resources: CourseResource[]): void {
  if (document.getElementById("downloadAllButton")) return;

  const buttonHtml = `
    <div style="display: flex; flex-direction: row; justify-content: end; margin-right: 24px; margin-top: 20px;">
    <button type="button" class="el-button submit-btn el-button--primary" id="downloadAllButton">
      下载全部
    </button>
    </div>
    `;

  const resourceList = Utils.$x("/html/body/div/div/div[2]/div[2]/div/div/div");
  if (!resourceList.length) return;

  const containerElement = document.createElement("div");
  containerElement.innerHTML = buttonHtml;
  resourceList[0].before(containerElement);

  const button = document.getElementById("downloadAllButton") as HTMLButtonElement | null;
  if (!button) return;

  const zipMode = Settings.get("course", "zipBatchDownload");
  const idleLabel = zipMode ? "打包下载" : "下载全部";
  const cancelLabel = zipMode ? "取消打包" : "取消下载";
  button.textContent = idleLabel;

  button.onclick = async () => {
    if (context.isBatchDownloading()) {
      context.setBatchDownloading(false);
      context.downloadManager.cancel();
      button.textContent = idleLabel;
      return;
    }

    if (!Array.isArray(resources) || resources.length === 0) {
      NotificationManager.show("暂无文件", "当前课程没有可下载的课件", "info");
      return;
    }

    context.setBatchDownloading(true);
    button.textContent = cancelLabel;

    try {
      if (zipMode) {
        await downloadResourcesAsZip(context, resources);
      } else {
        await runLegacyBatchDownload(context, resources);
      }
    } catch {
      // errors handled within download functions
    } finally {
      context.setBatchDownloading(false);
      button.textContent = idleLabel;
    }
  };
}

function addDownloadButton(
  context: CourseResourceContext,
  container: HTMLElement,
  resource: CourseResource,
  index: number,
  resolvedName: string
): void {
  const downloadBtn = document.createElement("i");
  downloadBtn.title = "下载";
  downloadBtn.classList.add("by-icon-download", "btn-icon", "visible");
  downloadBtn.style.cssText = `
    display: inline-block !important;
    visibility: visible !important;
    cursor: pointer !important;
    `;

  const dataAttr = Array.from(container.attributes).find((attr) =>
    attr.localName.startsWith("data-v")
  );
  if (dataAttr) {
    downloadBtn.setAttribute(dataAttr.localName, "");
  }

  downloadBtn.addEventListener(
    "click",
    async (e) => {
      e.stopPropagation();
      const resourceId = getResourceId(resource);
      if (!resourceId) {
        NotificationManager.show("下载失败", "未找到资源标识", "error");
        return;
      }
      try {
        const { previewUrl } = await API.getPreviewURL(resourceId);
        const useGM = typeof GM_download === "function";
        const fallbackName =
          resolvedName && typeof resolvedName === "string"
            ? resolvedName
            : resolveSingleFileName(
                resource?.name || resource?.resourceName || resource?.fileName || `文件_${index + 1}`,
                context.getCurrentCourseTitle(),
                `文件_${index + 1}`
              );
        if (useGM) {
          await context.downloadManager.downloadViaGM(previewUrl, fallbackName, true);
        } else {
          await context.downloadManager.downloadFile(previewUrl, fallbackName);
        }
      } catch (error: unknown) {
        LOG.error("Download error:", error);
        NotificationManager.show("下载失败", describeError(error), "error");
      }
    },
    false
  );

  container
    .querySelectorAll("i.by-icon-download, i.by-icon-yundown-grey, i.by-icon-eye-grey")
    .forEach((icon) => icon.remove());
  container.insertAdjacentElement("afterbegin", downloadBtn);
}

function dedupeFileName(
  folderKey: string,
  filename: string,
  tracker: Map<string, Set<string>>
): string {
  const key = folderKey || ".";
  if (!tracker.has(key)) tracker.set(key, new Set());
  const used = tracker.get(key)!;
  const dotIndex = filename.lastIndexOf(".");
  const namePart = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";
  let candidate = filename;
  let counter = 1;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${namePart} (${counter})${ext}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildZipIndexHtml(courseName: string, entries: ZipEntry[]): string {
  const tree: ZipTreeNode = { name: "", children: new Map(), files: [] };
  const collator =
    typeof Intl !== "undefined" && Intl.Collator
      ? new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" })
      : null;
  const compare = (a: string, b: string) => (collator ? collator.compare(a, b) : a.localeCompare(b));

  const addEntry = (relativePath: string, entry: ZipEntry) => {
    const segments = relativePath.split("/").filter(Boolean);
    let node = tree;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i];
      let child = node.children.get(segment);
      if (!child) {
        child = { name: segment, children: new Map(), files: [] };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.files.push(entry);
  };

  entries.forEach((entry) => addEntry(entry.relativePath, entry));

  const renderNode = (node: ZipTreeNode): string => {
    const childFolders = Array.from(node.children.keys()).sort(compare);
    const files = node.files.slice().sort((a, b) => compare(a.name, b.name));
    let html = "<ul>";

    childFolders.forEach((folderName) => {
      const child = node.children.get(folderName);
      if (!child) return;
      html += `<li class="folder"><span>${Utils.escapeHtml(folderName)}</span>${renderNode(child)}</li>`;
    });

    files.forEach((file) => {
      html += `<li class="file"><a href="${file.encodedPath}" download="${Utils.escapeHtml(
        file.name
      )}">${Utils.escapeHtml(file.name)}</a><span class="size">${Utils.escapeHtml(
        Utils.formatBytes(file.size)
      )}</span></li>`;
    });

    html += "</ul>";
    return html;
  };

  const generatedAt = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${Utils.escapeHtml(courseName)} - 课件索引</title>
  <style>
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px; color: #333; background: #fafafa; }
  h1 { margin-bottom: 0.2em; }
  .summary { color: #666; margin-bottom: 1em; }
  ul { list-style: none; margin-left: 1em; padding-left: 1em; border-left: 1px dashed #ddd; }
  li { margin: 4px 0; }
  li.folder > span { font-weight: 600; color: #409EFF; }
  li.file a { text-decoration: none; color: #2c3e50; }
  li.file a:hover { text-decoration: underline; }
  li.file .size { color: #999; margin-left: 8px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${Utils.escapeHtml(courseName)} - 课件索引</h1>
  <div class="summary">共 ${entries.length} 个文件 · 生成时间：${Utils.escapeHtml(generatedAt)}</div>
  <div class="tree">
  ${renderNode(tree)}
  </div>
</body>
</html>`;
}
