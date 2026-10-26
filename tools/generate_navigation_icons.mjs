import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(
  repositoryRoot,
  'legacy',
  'web',
  'node_modules',
  '@ant-design',
  'icons-svg',
);
const outputDirectory = path.join(repositoryRoot, 'ui', 'assets', 'nav-icons');
const iconNames = [
  'DashboardOutlined',
  'MessageOutlined',
  'LockOutlined',
  'BankOutlined',
  'TeamOutlined',
  'SafetyCertificateOutlined',
  'ClockCircleOutlined',
  'SmileOutlined',
  'DollarOutlined',
  'InboxOutlined',
  'BranchesOutlined',
  'DesktopOutlined',
  'ShopOutlined',
  'FileTextOutlined',
  'FolderOpenOutlined',
  'CustomerServiceOutlined',
  'CalendarOutlined',
  'BarChartOutlined',
  'ControlOutlined',
  'BellOutlined',
  'SettingOutlined',
  'HomeOutlined',
  'UserOutlined',
  'CheckSquareOutlined',
  'FormOutlined',
  'MenuOutlined',
  'MenuFoldOutlined',
  'MenuUnfoldOutlined',
  'CloudServerOutlined',
  'CheckCircleOutlined',
  'ArrowUpOutlined',
  'EyeOutlined',
  'EyeInvisibleOutlined',
  'KeyOutlined',
  'MobileOutlined',
  'ApartmentOutlined',
  'EnvironmentOutlined',
  'PlusOutlined',
  'SearchOutlined',
  'ReloadOutlined',
  'DownloadOutlined',
  'EditOutlined',
  'DeleteOutlined',
  'ScissorOutlined',
  'CopyOutlined',
  'SnippetsOutlined',
  'FileAddOutlined',
  'FolderAddOutlined',
  'UploadOutlined',
  'FolderOutlined',
  'FileOutlined',
  'ArrowLeftOutlined',
  'ArrowRightOutlined',
  'UnorderedListOutlined',
  'AppstoreOutlined',
  'DownOutlined',
  'BgColorsOutlined',
  'TranslationOutlined',
  'TableOutlined',
  'SunOutlined',
  'MoonOutlined',
  'GlobalOutlined',
  'LayoutOutlined',
  'CheckOutlined',
  'SaveOutlined',
  'UndoOutlined',
];

const require = createRequire(import.meta.url);
const packageMetadata = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
);
if (packageMetadata.version !== '4.6.0' || packageMetadata.license !== 'MIT') {
  throw new Error(
    `Expected @ant-design/icons-svg@4.6.0 (MIT); found ${packageMetadata.version} (${packageMetadata.license})`,
  );
}

const escapeAttribute = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

const checkOnly = process.argv.includes('--check');
fs.mkdirSync(outputDirectory, { recursive: true });

for (const iconName of iconNames) {
  const modulePath = path.join(packageRoot, 'lib', 'asn', `${iconName}.js`);
  const definition = require(modulePath).default?.icon;
  if (!definition?.attrs?.viewBox || !Array.isArray(definition.children)) {
    throw new Error(`Invalid Ant Design SVG definition: ${iconName}`);
  }

  const paths = definition.children.map((child) => {
    if (child.tag !== 'path' || typeof child.attrs?.d !== 'string') {
      throw new Error(`Unsupported SVG child in ${iconName}: ${child.tag}`);
    }
    const attributes = Object.entries(child.attrs)
      .filter(([key]) => key !== 'd' && key !== 'fill')
      .map(([key, value]) => {
        const svgKey = key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
        return ` ${svgKey}="${escapeAttribute(value)}"`;
      })
      .join('');
    return `<path fill="#FFFFFF" d="${escapeAttribute(child.attrs.d)}"${attributes}/>`;
  });

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"',
    ` viewBox="${escapeAttribute(definition.attrs.viewBox)}">`,
    ...paths,
    '</svg>',
    '',
  ].join('');
  const outputPath = path.join(outputDirectory, `${iconName}.svg`);

  if (checkOnly) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== svg) {
      throw new Error(`Generated icon is stale or missing: ${outputPath}`);
    }
  } else {
    fs.writeFileSync(outputPath, svg, 'utf8');
  }
}

if (!checkOnly) {
  console.log(`Generated ${iconNames.length} navigation SVGs in ${outputDirectory}`);
}
