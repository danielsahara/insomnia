import GitVCS, { GIT_CLONE_DIR, GIT_INSOMNIA_DIR } from '../git-vcs';
import { setupDateMocks } from './util';
import { MemPlugin } from '../mem-plugin';
import path from 'path';
jest.mock('path');

describe.each(['posix'])('Git-VCS using path.%s', type => {
  beforeAll(() => path.__mockPath(type));
  afterAll(() => jest.restoreAllMocks());
  beforeEach(setupDateMocks);

  describe('common operations', () => {
    it('listFiles()', async () => {
      const fs = MemPlugin.createPlugin();

      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);
      await vcs.setAuthor('Karen Brown', 'karen@example.com');

      // No files exist yet
      const files1 = await vcs.listFiles();
      expect(files1).toEqual([]);

      await fs.promises.writeFile('/foo.txt', 'bar');
      const files2 = await vcs.listFiles();
      expect(files2).toEqual([]);
    });

    it('stage and unstage file', async () => {
      const fs = MemPlugin.createPlugin();
      await fs.promises.mkdir(GIT_INSOMNIA_DIR);
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/foo.txt`, 'foo');
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/bar.txt`, 'bar');

      // Files outside namespace should be ignored
      await fs.promises.writeFile('/other.txt', 'other');

      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);
      await vcs.setAuthor('Karen Brown', 'karen@example.com');

      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('*added');

      await vcs.add(`${GIT_INSOMNIA_DIR}/foo.txt`);
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('added');

      await vcs.remove(`${GIT_INSOMNIA_DIR}/foo.txt`);
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('*added');
    });

    it('Returns empty log without first commit', async () => {
      const fs = MemPlugin.createPlugin();
      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);
      await vcs.setAuthor('Karen Brown', 'karen@example.com');

      expect(await vcs.log()).toEqual([]);
    });

    it('commit file', async () => {
      const fs = MemPlugin.createPlugin();
      await fs.promises.mkdir(`${GIT_INSOMNIA_DIR}`);
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/foo.txt`, 'foo');
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/bar.txt`, 'bar');

      await fs.promises.writeFile('/other.txt', 'should be ignored');

      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);
      await vcs.setAuthor('Karen Brown', 'karen@example.com');
      await vcs.add(`${GIT_INSOMNIA_DIR}/foo.txt`);
      await vcs.commit('First commit!');

      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('unmodified');

      expect(await vcs.log()).toEqual([
        {
          author: {
            email: 'karen@example.com',
            name: 'Karen Brown',
            timestamp: 1000000000,
            timezoneOffset: 0,
          },
          committer: {
            email: 'karen@example.com',
            name: 'Karen Brown',
            timestamp: 1000000000,
            timezoneOffset: 0,
          },
          message: 'First commit!\n',
          oid: '76f804a23eef9f52017bf93f4bc0bfde45ec8a93',
          parent: [],
          tree: '14819d8019f05edb70a29850deb09a4314ad0afc',
        },
      ]);

      await fs.promises.unlink(`${GIT_INSOMNIA_DIR}/foo.txt`);
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('*deleted');

      await vcs.remove(`${GIT_INSOMNIA_DIR}/foo.txt`);
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('deleted');

      await vcs.remove(`${GIT_INSOMNIA_DIR}/foo.txt`);
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('deleted');
    });

    it('create branch', async () => {
      const fs = MemPlugin.createPlugin();
      await fs.promises.mkdir(`${GIT_INSOMNIA_DIR}`);
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/foo.txt`, 'foo');
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/bar.txt`, 'bar');

      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);
      await vcs.setAuthor('Karen Brown', 'karen@example.com');
      await vcs.add(`${GIT_INSOMNIA_DIR}/foo.txt`);
      await vcs.commit('First commit!');

      expect((await vcs.log()).length).toBe(1);

      await vcs.checkout('new-branch');
      expect((await vcs.log()).length).toBe(1);
      await vcs.add(`${GIT_INSOMNIA_DIR}/bar.txt`);
      await vcs.commit('Second commit!');
      expect((await vcs.log()).length).toBe(2);

      await vcs.checkout('master');
      expect((await vcs.log()).length).toBe(1);
    });

    it('should delete when removing an untracked file', async () => {
      const fs = MemPlugin.createPlugin();
      await fs.promises.mkdir(GIT_INSOMNIA_DIR);
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/foo.txt`, 'foo');
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/bar.txt`, 'bar');

      // Files outside namespace should be ignored
      await fs.promises.writeFile('/other.txt', 'other');

      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);

      // foo is staged, bar is unstaged, but both are untracked (thus, new to git)
      await vcs.add(`${GIT_INSOMNIA_DIR}/bar.txt`);
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('*added');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('added');

      // Remove both
      await vcs.remove(`${GIT_INSOMNIA_DIR}/foo.txt`, true);
      await vcs.remove(`${GIT_INSOMNIA_DIR}/bar.txt`, true);

      // Ensure git doesn't know about the two files anymore
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/foo.txt`)).toBe('absent');
      expect(await vcs.status(`${GIT_INSOMNIA_DIR}/bar.txt`)).toBe('absent');

      // Ensure the two files have been removed from the fs (memplugin)
      await expect(fs.promises.readFile(`${GIT_INSOMNIA_DIR}/bar.txt`)).rejects.toThrowError(
        `ENOENT: no such file or directory, scandir '${GIT_INSOMNIA_DIR}/bar.txt'`,
      );
      await expect(fs.promises.readFile(`${GIT_INSOMNIA_DIR}/foo.txt`)).rejects.toThrowError(
        `ENOENT: no such file or directory, scandir '${GIT_INSOMNIA_DIR}/foo.txt'`,
      );
    });
  });

  describe('readObjectFromTree()', () => {
    it('reads an object from tree', async () => {
      const fs = MemPlugin.createPlugin();
      await fs.promises.mkdir(`${GIT_INSOMNIA_DIR}`);
      await fs.promises.mkdir(`${GIT_INSOMNIA_DIR}/dir`);
      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/dir/foo.txt`, 'foo');

      const vcs = new GitVCS();
      await vcs.init(GIT_CLONE_DIR, fs);
      await vcs.setAuthor('Karen Brown', 'karen@example.com');

      await vcs.add(`${GIT_INSOMNIA_DIR}/dir/foo.txt`);
      await vcs.commit('First');

      await fs.promises.writeFile(`${GIT_INSOMNIA_DIR}/dir/foo.txt`, 'foo bar');
      await vcs.add(`${GIT_INSOMNIA_DIR}/dir/foo.txt`);
      await vcs.commit('Second');

      const log = await vcs.log();
      expect(await vcs.readObjFromTree(log[0].tree, `${GIT_INSOMNIA_DIR}/dir/foo.txt`)).toBe(
        'foo bar',
      );
      expect(await vcs.readObjFromTree(log[1].tree, `${GIT_INSOMNIA_DIR}/dir/foo.txt`)).toBe('foo');

      // Some extra checks
      expect(await vcs.readObjFromTree(log[1].tree, 'missing')).toBe(null);
      expect(await vcs.readObjFromTree('missing', 'missing')).toBe(null);
    });
  });
});
