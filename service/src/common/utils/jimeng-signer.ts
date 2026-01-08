import * as crypto from 'crypto';
import { URLSearchParams } from 'url';

/**
 * 不参与加签过程的 header key
 */
const HEADER_KEYS_TO_IGNORE = new Set([
  'authorization',
  'content-type',
  'content-length',
  'user-agent',
  'presigned-expires',
  'expect',
]);

/**
 * 即梦AI签名参数接口
 */
export interface SignParams {
  headers?: Record<string, string>;
  query?: Record<string, any>;
  region?: string;
  serviceName?: string;
  method?: string;
  pathName?: string;
  accessKeyId: string;
  secretAccessKey: string;
  needSignHeaderKeys?: string[];
  bodySha?: string;
  body?: string | URLSearchParams | Buffer;
}

/**
 * 即梦AI签名认证工具类
 * 移植自 singularityGenerater 项目
 */
export class JiMengSigner {
  static sign(params: SignParams): string {
    const {
      headers = {},
      query = {},
      region = 'cn-north-1',
      serviceName = 'cv',
      method = 'POST',
      pathName = '/',
      accessKeyId = '',
      secretAccessKey = '',
      needSignHeaderKeys = [],
      bodySha,
      body,
    } = params;

    if (!headers['X-Date']) {
      headers['X-Date'] = JiMengSigner.getDateTimeNow();
    }

    const datetime = headers['X-Date'];
    const date = datetime.substring(0, 8);

    const [signedHeaders, canonicalHeaders] = JiMengSigner.getSignHeaders(headers, needSignHeaderKeys);
    const bodyHash = bodySha || JiMengSigner.getBodySha(body);
    
    const canonicalRequest = [
      method.toUpperCase(),
      pathName,
      JiMengSigner.queryParamsToString(query) || '',
      `${canonicalHeaders}\n`,
      signedHeaders,
      bodyHash,
    ].join('\n');

    const credentialScope = [date, region, serviceName, 'request'].join('/');
    const stringToSign = ['HMAC-SHA256', datetime, credentialScope, JiMengSigner.hash(canonicalRequest)].join('\n');
    
    const kDate = JiMengSigner.hmac(secretAccessKey, date);
    const kRegion = JiMengSigner.hmac(kDate, region);
    const kService = JiMengSigner.hmac(kRegion, serviceName);
    const kSigning = JiMengSigner.hmac(kService, 'request');
    const signature = JiMengSigner.hmac(kSigning, stringToSign).toString('hex');

    return [
      'HMAC-SHA256',
      `Credential=${accessKeyId}/${credentialScope},`,
      `SignedHeaders=${signedHeaders},`,
      `Signature=${signature}`,
    ].join(' ');
  }

  private static hmac(secret: string | Buffer, data: string): Buffer {
    return crypto.createHmac('sha256', secret).update(data, 'utf8').digest();
  }

  private static hash(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  private static queryParamsToString(params: Record<string, any>): string {
    return Object.keys(params)
      .sort()
      .map((key) => {
        const val = params[key];
        if (typeof val === 'undefined' || val === null) return undefined;
        const escapedKey = JiMengSigner.uriEscape(key);
        if (!escapedKey) return undefined;
        if (Array.isArray(val)) {
          return `${escapedKey}=${val.map(JiMengSigner.uriEscape).sort().join(`&${escapedKey}=`)}`;
        }
        return `${escapedKey}=${JiMengSigner.uriEscape(val)}`;
      })
      .filter((v) => v)
      .join('&');
  }

  private static getSignHeaders(originHeaders: Record<string, string>, needSignHeaders: string[]): [string, string] {
    function trimHeaderValue(header: any): string {
      return header?.toString?.().trim().replace(/\s+/g, ' ') ?? '';
    }

    let h = Object.keys(originHeaders);
    if (Array.isArray(needSignHeaders) && needSignHeaders.length > 0) {
      const needSignSet = new Set([...needSignHeaders, 'x-date', 'host'].map((k) => k.toLowerCase()));
      h = h.filter((k) => needSignSet.has(k.toLowerCase()));
    }
    h = h.filter((k) => !HEADER_KEYS_TO_IGNORE.has(k.toLowerCase()));
    
    const signedHeaderKeys = h.map((k) => k.toLowerCase()).sort().join(';');
    const canonicalHeaders = h
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
      .map((k) => `${k.toLowerCase()}:${trimHeaderValue(originHeaders[k])}`)
      .join('\n');
      
    return [signedHeaderKeys, canonicalHeaders];
  }

  private static uriEscape(str: string): string {
    try {
      return encodeURIComponent(str)
        .replace(/[^A-Za-z0-9_.~\-%]+/g, (s) => escape(s))
        .replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
    } catch (e) {
      return '';
    }
  }

  private static getDateTimeNow(): string {
    return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private static getBodySha(body?: string | URLSearchParams | Buffer): string {
    const hash = crypto.createHash('sha256');
    if (typeof body === 'string') hash.update(body);
    else if (body instanceof URLSearchParams) hash.update(body.toString());
    else if (Buffer.isBuffer(body)) hash.update(body);
    else hash.update('');
    return hash.digest('hex');
  }
}
