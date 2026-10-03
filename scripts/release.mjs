/**
 * Cuts a release: bumps the version everywhere it lives, commits, and tags.
 *
 *   npm run release -- patch          0.1.0 -> 0.1.1
 *   npm run release -- minor          0.1.0 -> 0.2.0
 *   npm run release -- 1.0.0          an exact version
 *   npm run release -- patch --push   ...and push, which starts the GitHub build
 *
 * The tag (v1.2.3) is what triggers .github/workflows/release.yml, and that
 * workflow refuses to build if the tag and tauri.conf.json disagree.
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
const args = process.argv.slice(2)
const bump = args.find((a) => !a.startsWith('--'))
const push = args.includes('--push')

if (!bump) {
  console.error('Usage: npm run release -- <patch|minor|major|x.y.z> [--push]')
  process.exit(1)
}
if (sh('git status --porcelain')) {
  console.error('Commit or stash your changes first; a release should be exactly what is committed.')
  process.exit(1)
}

const conf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
const [maj, min, pat] = conf.version.split('.').map(Number)
const next =
  bump === 'major' ? `${maj + 1}.0.0`
  : bump === 'minor' ? `${maj}.${min + 1}.0`
  : bump === 'patch' ? `${maj}.${min}.${pat + 1}`
  : /^\d+\.\d+\.\d+$/.test(bump) ? bump
  : null
if (!next) {
  console.error(`"${bump}" isn't patch, minor, major or a version like 1.2.3.`)
  process.exit(1)
}
if (sh(`git tag --list v${next}`)) {
  console.error(`v${next} is already tagged.`)
  process.exit(1)
}

conf.version = next
writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n')

// Only the [package] version, never a dependency's.
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
writeFileSync('src-tauri/Cargo.toml', cargo.replace(/(\[package\][^[]*?\nversion = ")[^"]+(")/, `$1${next}$2`))
const lock = readFileSync('src-tauri/Cargo.lock', 'utf8')
writeFileSync('src-tauri/Cargo.lock', lock.replace(/(name = "learning-goals"\nversion = ")[^"]+(")/, `$1${next}$2`))

sh(`npm version ${next} --no-git-tag-version --allow-same-version`)

sh('git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock')
sh(`git commit -m "Release v${next}"`)
sh(`git tag -a v${next} -m "Learning Goals v${next}"`)
console.log(`Tagged v${next}.`)

if (push) {
  sh('git push --follow-tags')
  console.log('Pushed. GitHub Actions is building the DMG; it appears as a draft release when done.')
} else {
  console.log('Push it to start the GitHub build:  git push --follow-tags')
}
