import { invoke } from '@tauri-apps/api/core';
import { basename, desktopDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, create } from '@tauri-apps/plugin-fs';

/**
 * 临时文件管理器 —— 在桌面 `km-temp` 目录下创建临时文件。
 *
 * 用于存储采集过程中下载的图片等临时资源。
 * 通过 Tauri `task_create_folder` 命令确保目录存在，再通过 `@tauri-apps/plugin-fs` 写入文件。
 *
 * @example
 * ```ts
 * await file_temp.create('https://example.com/image.jpg', uint8ArrayData);
 * ```
 */
class FileTemp {
    base_dir = BaseDirectory.Desktop;
    desktop_dir = desktopDir();
    folder = 'km-temp';

    async create(url: string, content: Uint8Array) {
        // const base_path = await this.desktop_dir;
        // const full_path = await join(base_path, this.folder, url);
        const file_name = await basename(url);
        const path = url.replace(file_name, '') ?? '';

        const res = await invoke<string>('task_create_folder', { url: path, });
        const json_data = JSON.parse(res) as ITauriResponse<string>;
        const file = await create(await join(json_data.data!, file_name) );
        await file.write(content);
        await file.close();
    }
}

export const file_temp = new FileTemp();
