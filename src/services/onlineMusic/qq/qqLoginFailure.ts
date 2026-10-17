import { OnlineProviderError } from '../../../types/onlineMusic';
import type { LoginFailureDetail, LoginStep } from '../../../types/onlineMusic';
import { QQ_API_NOT_RUNNING } from './qqTransport';
import { qqStatusFailure } from './qqFailure';

// src/services/onlineMusic/qq/qqLoginFailure.ts
// QQ 音乐登录失败时交给登录窗口的事实。后端的错误是什么意思，只在这里说。

// 登录的某一步抛了错（都出自 qqTransport.ts 的 requestQq）。
export const describeQqLoginFailure = (_step: LoginStep, error: unknown): LoginFailureDetail | null => {
    // 请求是裸 fetch：连不上时它抛 TypeError。
    if (error instanceof TypeError) return { case: 'unreachable' };
    if (!(error instanceof OnlineProviderError)) return null;
    if (error.message.startsWith(QQ_API_NOT_RUNNING)) return { case: 'local-service-unavailable' };
    const status = qqStatusFailure(error);
    // 502 而回答里没有 QQ 的码：后端没能连上 QQ（断网时就是这样），不是 QQ 拒绝了。后端照样要过一会才肯再给
    // 二维码，等多久留在事实里，重来的操作先等。
    const upstreamCode = (error.cause as { upstreamCode?: unknown } | null | undefined)?.upstreamCode;
    if (status?.httpStatus === 502 && upstreamCode === undefined) return { case: 'unreachable', ...status };
    return status;
};

/**
 * login_qr_check 回了 801 到 803 之外的状态码。800 带着 upstreamCode 时是上游要求稍后再试（`wait`），
 * 不是二维码过期；`upstreamCode` 是上游的风控编号，照旧不解释它的意思。
 */
export const qqCheckFailure = (response: any, wait = false): LoginFailureDetail => {
    const code = Number(response?.code);
    return {
        ...(wait ? { case: 'retry-later' as const } : {}),
        ...(Number.isFinite(code) ? { code: String(code) } : {}),
        ...(typeof response?.message === 'string' && response.message ? { message: response.message } : {}),
        ...(response?.upstreamCode === undefined ? {} : { upstreamCode: String(response.upstreamCode) }),
        ...(typeof response?.retryAfterMs === 'number' ? { retryAfterMs: response.retryAfterMs } : {}),
    };
};
