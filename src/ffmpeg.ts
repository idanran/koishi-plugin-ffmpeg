import { Context, Service } from 'koishi'
import { spawn } from 'child_process'
import { Readable } from 'stream'

declare module 'koishi' {
  interface Context {
    ffmpeg: FFmpeg
  }
}

interface RunReturn {
  file: Promise<void>
  buffer: Promise<Buffer>
  stream: Readable
}

export class FFmpegBuilder {
  _input: string | Buffer | Readable
  inputOptions: string[] = []
  outputOptions: string[] = []
  constructor(public executable: string) {}

  input(path: string): FFmpegBuilder
  input(buffer: Buffer): FFmpegBuilder
  input(stream: Readable): FFmpegBuilder
  input(arg: string | Buffer | Readable): FFmpegBuilder {
    this._input = arg
    return this
  }

  inputOption(...option: string[]): FFmpegBuilder {
    this.inputOptions.push(...option)
    return this
  }

  outputOption(...option: string[]): FFmpegBuilder {
    this.outputOptions.push(...option)
    return this
  }

  run<T extends keyof RunReturn>(type: T, path?: string): RunReturn[T] {
    const options: string[] = ['-y']
    if (typeof this._input === 'string') {
      options.push(...[...this.inputOptions, '-i', this._input])
    } else {
      options.push(...[...this.inputOptions, '-i', '-'])
    }
    if (type === 'file') {
      options.push(...[...this.outputOptions, path])
    } else {
      options.push(...[...this.outputOptions, '-'])
    }
    const child = spawn(this.executable, options, { stdio: 'pipe' })
    child.stderr.pipe(process.stderr)
    if (this._input instanceof Buffer) {
      child.stdin.write(this._input)
      child.stdin.end()
    } else if (this._input instanceof Readable) {
      this._input.pipe(child.stdin)
    }
    if (type === 'stream') {
      return child.stdout as any
    } else {
      return new Promise<void | Buffer>((resolve, reject) => {
        child.stdin.on('error', function (err) {
          if (!['ECONNRESET', 'EPIPE', 'EOF'].includes(err['code'])) reject(err)
        })
        child.on('error', reject)
        if (type === 'file') {
          child.on('exit', code => code === 0 ? resolve() : reject(new Error(`exited with ${code}`)))
        } else if (type === 'buffer') {
          const buffer = []
          child.stdout.on('data', data => buffer.push(data))
          child.stdout.on('end', () => resolve(Buffer.concat(buffer)))
          child.stdout.on('error', reject)
        }
      }) as any
    }
  }
}

export class FFmpeg extends Service {
  constructor(ctx: Context, public executable: string) {
    super(ctx, 'ffmpeg')
  }

  builder() {
    return new FFmpegBuilder(this.executable)
  }
}
