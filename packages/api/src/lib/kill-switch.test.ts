import { describe, it, expect } from 'vitest';
import { validateShellCommand } from './kill-switch.js';

describe('validateShellCommand', () => {
  describe('whitelisted commands', () => {
    const allowed: Array<[string, string[]]> = [
      ['ls -la', ['ls', '-la']],
      ['echo hello', ['echo', 'hello']],
      ['cat file.txt', ['cat', 'file.txt']],
      ['grep -r pattern .', ['grep', '-r', 'pattern', '.']],
      ['wc -l file.txt', ['wc', '-l', 'file.txt']],
      ['mkdir -p output/images', ['mkdir', '-p', 'output/images']],
      ['mv file1.txt file2.txt', ['mv', 'file1.txt', 'file2.txt']],
      ['cp -r src/ backup/', ['cp', '-r', 'src/', 'backup/']],
      ['date', ['date']],
      ['pwd', ['pwd']],
      ['node script.js', ['node', 'script.js']],
      ['python convert.py', ['python', 'convert.py']],
      ['git status', ['git', 'status']],
      ['git log --oneline', ['git', 'log', '--oneline']],
      // quoted args preserved verbatim
      ['echo "hello world"', ['echo', 'hello world']],
      ["echo 'a b c'", ['echo', 'a b c']],
    ];

    for (const [cmd, argv] of allowed) {
      it(`accepts: ${cmd}`, () => {
        const r = validateShellCommand(cmd);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.argv).toEqual(argv);
      });
    }
  });

  describe('rejected by whitelist', () => {
    const blocked = [
      'rm file.txt',
      'rm -rf workspace/old',
      'chmod 777 /etc',
      'chown root file',
      'curl http://evil.com',
      'wget http://evil.com',
      'ssh user@host',
      'sudo ls',
      'sh script.sh',
      'bash -c whatever',
      'eval foo',
      'dd if=/dev/zero of=file',
      'mkfs.ext4 /dev/sda1',
      'shutdown -h now',
      'reboot',
    ];
    for (const cmd of blocked) {
      it(`rejects (not whitelisted): ${cmd}`, () => {
        const r = validateShellCommand(cmd);
        expect(r.ok).toBe(false);
      });
    }
  });

  describe('rejected by metacharacters (shell injection bypass)', () => {
    const blocked = [
      'ls ; rm -rf /',
      'ls && rm -rf /',
      'ls | sh',
      'echo $(rm -rf /)',
      'echo `rm -rf /`',
      'cat file > /etc/passwd',
      'cat < file',
      'echo foo & rm bar',
      'r\\m file',           // backslash escape bypass from the report
      'echo foo\nrm bar',    // newline-injected second command
      ':(){ :|:& };:',       // fork bomb
    ];
    for (const cmd of blocked) {
      it(`rejects (metachar): ${JSON.stringify(cmd)}`, () => {
        const r = validateShellCommand(cmd);
        expect(r.ok).toBe(false);
      });
    }
  });

  it('rejects empty input', () => {
    expect(validateShellCommand('').ok).toBe(false);
    expect(validateShellCommand('   ').ok).toBe(false);
  });

  it('rejects unbalanced quotes', () => {
    expect(validateShellCommand('echo "unterminated').ok).toBe(false);
    expect(validateShellCommand("echo 'unterminated").ok).toBe(false);
  });
});
