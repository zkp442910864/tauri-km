import { invoke } from '@tauri-apps/api/core';
import { basename, desktopDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, create } from '@tauri-apps/plugin-fs';

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