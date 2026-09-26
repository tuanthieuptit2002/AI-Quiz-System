import type { Config } from './config.js';
import { httpError } from './http.js';

export async function deepSeekJSON<T>(
  config: Config,
  systemPrompt: string,
  input: unknown,
  model: string,
  validate: (output: unknown) => T,
  transport: typeof fetch = fetch,
): Promise<T> {
  if (!config.deepseekApiKey) httpError(503, 'Chưa cấu hình DEEPSEEK_API_KEY trên backend.');
  const deadline = AbortSignal.timeout(120000);
  const attempt = async (correction = '') => {
    let response: Response;
    try {
      response = await transport('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(90000)]),
        headers: {
          Authorization: `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 8192,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(input) },
            ...(correction
              ? [
                  {
                    role: 'user',
                    content: `The previous output failed validation: ${correction}. Produce a corrected complete JSON object with the requested output, obeying all system rules. Do not repeat the invalid structure.`,
                  },
                ]
              : []),
          ],
        }),
      });
    } catch {
      httpError(502, 'Không kết nối được DeepSeek hoặc yêu cầu quá 90 giây. Hãy thử lại.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        httpError(503, 'DeepSeek từ chối API key. Kiểm tra cấu hình backend.');
      if (response.status === 402) httpError(503, 'Tài khoản DeepSeek không đủ số dư.');
      if (response.status === 429)
        httpError(429, 'DeepSeek đang giới hạn yêu cầu. Vui lòng thử lại sau.');
      httpError(502, 'DeepSeek chưa xử lý được yêu cầu. Kiểm tra model hoặc thử lại sau.');
    }
    let output: unknown;
    try {
      const reader = response.body!.getReader();
      const parts: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024 * 1024) throw new Error();
          parts.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
      const choice = result.choices?.[0];
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string')
        throw new Error();
      output = JSON.parse(choice.message.content);
    } catch {
      throw Object.assign(
        new Error('AI trả nội dung rỗng, bị cắt ngắn hoặc không phải JSON hợp lệ. Hãy thử lại.'),
        { status: 502, retryableOutput: true },
      );
    }
    try {
      return validate(output);
    } catch (error) {
      throw Object.assign(error as Error, { retryableOutput: true });
    }
  };
  try {
    return await attempt();
  } catch (error) {
    if (!(error as { retryableOutput?: boolean }).retryableOutput || deadline.aborted) throw error;
    return attempt((error as Error).message);
  }
}
