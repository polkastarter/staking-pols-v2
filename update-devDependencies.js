
const { exec } = require('child_process');
const { execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const readFile = promisify(fs.readFile);
// const writeFile = promisify(fs.writeFile);

async function getVersionDev(name) {
  const { stdout } = await promisify(exec)(`pnpm list '${name}' --depth=0 --json`);
  const data = JSON.parse(stdout);
  const version = data[0].devDependencies[name].version;
  return version;
}


async function upgradePackages() {

  // Read package.json
  const packageJson = await readFile('package.json', 'utf8');
  const { dependencies, devDependencies, ...otherProps } = JSON.parse(packageJson);

  for (const [name, version] of Object.entries({ ...devDependencies })) {

    const version = await getVersionDev(name);
    process.stdout.write(name + ' : ' + version);

    try {
      await promisify(exec)(`pnpm update ${name}`);
    } catch (error) {
      console.error(`\n  ERROR: ${error.message}`);
    }

    const versionNew = await getVersionDev(name);
    if (versionNew == version) {
      console.log(' - ok');
    } else {
      console.log(" =>", versionNew);
    }

  }

  console.log("outdated packages :");
  // try {
  const { stdout } = await promisify(exec)(`pnpm outdated`);
  console.log(stdout);
  // } catch (error) {
  //   console.error(`\n  ERROR: ${error.message}`);
  // }
}

upgradePackages().catch(console.error);
