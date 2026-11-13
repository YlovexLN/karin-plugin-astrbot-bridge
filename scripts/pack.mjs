// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 YlovexLN

/**
 * 把本插件打成 dist/<name>.zip，并在 dist/<name>/ 留一份解压好的，
 * 方便直接拷贝文件夹安装。
 *
 * 用法：node scripts/pack.mjs        （bridge 侧可用 npm run build）
 * 依赖：只用 Node 标准库，不需要 Python、不需要 npm install
 */
import { deflateRawSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, relative, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ARCROOT = "karin-plugin-astrbot-bridge"
const ZIP_NAME = "karin-plugin-astrbot-bridge-v0.0.1.zip"
/** 解压副本目录名（与 zip 同名，去掉 .zip），没有解压副本时为 null */
const UNPACKED = "karin-plugin-astrbot-bridge"
/**
 * 不随包发布：开发文档、打包脚本本身、CI 配置、缓存与运行时数据。
 * LICENSE 必须进包（AGPL 分发要求）。
 * web/ 是面板的 TS 源码（要构建才能跑），装插件的人只需要 web-dist/ 的产物。
 */
const SKIP_DIRS = new Set(['.git', '.github', '.agents', 'node_modules', '__pycache__', '@karinjs', 'dist', 'docs', 'scripts', 'web'])
/** 维护者文件不进包；_install_record.json 是运行时写的安装记录 */
const SKIP_FILES = new Set(['.gitignore', '.gitattributes', '.npmrc', 'AGENTS.md', '_install_record.json'])
const SKIP_EXT = new Set(['.pyc', '.pyo', '.log'])

/** CRC32（zip 头需要它，node 标准库没有现成的） */
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c >>> 0
}
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const collect = (dir, out = []) => {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collect(full, out)
    } else if (!SKIP_FILES.has(entry) && !SKIP_EXT.has(extname(entry))) {
      out.push(full)
    }
  }
  return out
}

const dosTime = (date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  day: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
})

/** dist/<name>/ —— 解压好的副本，和 zip 内容逐字节一致 */
const copyUnpacked = (file) => {
  if (!UNPACKED) return
  const target = join(ROOT, 'dist', UNPACKED)
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  for (const src of file) {
    const rel = relative(ROOT, src)
    const dest = join(target, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(src))
  }
}

const build = () => {
  const files = collect(ROOT)
  const zipPath = join(ROOT, 'dist', ZIP_NAME)
  mkdirSync(dirname(zipPath), { recursive: true })
  if (existsSync(zipPath)) rmSync(zipPath)

  const { time, day } = dosTime(new Date())
  const locals = []
  const centrals = []
  let offset = 0

  for (const file of files) {
    const name = ARCROOT + '/' + relative(ROOT, file).split(sep).join('/')
    const data = readFileSync(file)
    const packed = deflateRawSync(data, { level: 9 })
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0x0800, 6)      // UTF-8 文件名标志
    local.writeUInt16LE(8, 8)           // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, packed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x031e, 4)    // made by: unix, 3.0
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)        // extra
    central.writeUInt16LE(0, 32)        // comment
    central.writeUInt16LE(0, 34)        // disk
    central.writeUInt16LE(0, 36)        // internal attr
    central.writeUInt32LE(0o644 << 16, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + packed.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt32LE(0, 4)
  end.writeUInt16LE(centrals.length / 2, 8)
  end.writeUInt16LE(centrals.length / 2, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  writeFileSync(zipPath, Buffer.concat([...locals, centralBuf, end]))
  copyUnpacked(files)

  console.log(ZIP_NAME, statSync(zipPath).size, 'bytes', files.length, 'files ->', zipPath)
  if (UNPACKED) console.log('解压副本 ->', join(ROOT, 'dist', UNPACKED))
}

build()
