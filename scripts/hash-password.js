const bcrypt = require('bcryptjs');
const readline = require('node:readline');

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('请在交互式终端中运行此命令');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    readline.emitKeypressEvents(process.stdin);
    process.stderr.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const finish = (error) => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('已取消'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (!key.ctrl && !key.meta && character) value += character;
    };
    process.stdin.on('keypress', onKeypress);
  });
}

async function main() {
  let password = '';
  try {
    password = await readHidden('输入后台密码（至少 12 个字符，不会显示）：');
    if (password.length < 12) throw new Error('密码至少需要 12 个字符');
    const hash = await bcrypt.hash(password, 12);
    password = '';
    process.stdout.write(`${hash}\n`);
  } catch (error) {
    password = '';
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

main();
