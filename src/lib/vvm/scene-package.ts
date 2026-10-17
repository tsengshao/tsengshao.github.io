import { gunzipSync } from 'fflate';

/** Preserve SHA-256 verification on LAN HTTP, where Web Crypto is unavailable. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const digest = subtle
    ? new Uint8Array(await subtle.digest('SHA-256', data.slice().buffer))
    : (await import('@noble/hashes/sha2.js')).sha256(data);
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

export type SceneAnnotation = { name: string; text: string };
export type LookupTable = { nodes: number[][]; [key: string]: unknown };
export type SceneItem = {
  id: string;
  name: string;
  actor: Record<string, unknown>;
  actorRotation?: number[];
  mapper: Record<string, unknown> & { colorByArrayName?: string };
  property: Record<string, unknown>;
  dataset: Record<string, unknown>;
  statistics?: { bounds: number[] };
  texture?: string;
  textureSettings?: Record<string, unknown>;
};
export type SceneDescriptor = {
  background: number[];
  camera: Record<string, unknown>;
  centerOfRotation: number[];
  lights?: Array<
    Record<string, unknown> & { diffuseColor?: number[]; lightType?: number }
  >;
  lookupTables?: Record<string, LookupTable>;
  annotations?: SceneAnnotation[];
  overlay?: string;
  scene: SceneItem[];
};
export type Legend = {
  title: string;
  arrayName: string;
  position: number[];
  length: number;
  orientation: string;
};
export type Manifest = {
  format: string;
  dataset: string;
  initialTime: number;
  viewSize: number[];
  frames: Array<{ index: number; time: number; scene: SceneDescriptor }>;
  assets: Record<
    string,
    {
      offset: number;
      length: number;
      rawLength: number;
      sha256: string;
      compression: string;
    }
  >;
  legends: Legend[];
  limitations: string[];
  navigation?: {
    pivot?: [number, number, number];
    domainBounds?: [number, number, number, number, number, number];
  };
  orientationAxes?: Record<string, string[]>;
};

// Each block is independently compressed. File selection never uploads data.
export class ScenePackage {
  public file: Blob;
  public manifest: Manifest;
  private base: number;

  private constructor(file: Blob, manifest: Manifest, base: number) {
    this.file = file;
    this.manifest = manifest;
    this.base = base;
  }

  static async open(file: Blob) {
    const prefix = await file.slice(0, 12).arrayBuffer();
    if (
      prefix.byteLength !== 12 ||
      new TextDecoder().decode(prefix.slice(0, 8)) !== 'VVMWEB2\n'
    ) {
      throw Error('不是支援的 .vvmweb 資料包');
    }
    const length = new DataView(prefix).getUint32(8, true);
    if (length > 64 * 1024 * 1024 || length + 12 > file.size)
      throw Error('資料包索引長度無效');
    const manifest = JSON.parse(
      await file.slice(12, 12 + length).text(),
    ) as Manifest;
    if (
      manifest.format !== 'vvmex-scene-v2' ||
      !manifest.frames?.length ||
      !manifest.assets
    ) {
      throw Error('資料包格式不完整');
    }
    for (const asset of Object.values(manifest.assets)) {
      if (
        !Number.isSafeInteger(asset.offset) ||
        !Number.isSafeInteger(asset.length) ||
        asset.offset < 0 ||
        asset.length < 0 ||
        12 + length + asset.offset + asset.length > file.size ||
        asset.compression !== 'gzip'
      ) {
        throw Error('資源索引無效');
      }
    }
    return new ScenePackage(file, manifest, 12 + length);
  }

  async asset(key: string) {
    const asset = this.manifest.assets[key];
    if (!asset) throw Error(`缺少資源 ${key}`);
    const raw = gunzipSync(
      new Uint8Array(
        await this.file
          .slice(
            this.base + asset.offset,
            this.base + asset.offset + asset.length,
          )
          .arrayBuffer(),
      ),
    );
    if (raw.length !== asset.rawLength) throw Error('資源長度不符');
    const hash = await sha256Hex(raw);
    if (hash !== asset.sha256 || hash !== key)
      throw Error('資源 SHA-256 驗證失敗');
    return raw;
  }
}
