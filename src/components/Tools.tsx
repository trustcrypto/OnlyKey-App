import React from 'react';
import { TOOLTIPS } from '../data/tooltips';
import { HelpTip } from './ui/HelpTip';
import { Tooltip } from './ui/Tooltip';
import AppUpdateSettings from './AppUpdateSettings';

// apps.onlykey.io serves firmware 3.1.0 and later. A key on v3.0.4 or earlier
// cannot connect there; the page sends it to apps.crp.to.
const WEBCRYPT_TOOLS = [
  { label: 'Encrypt Messages', href: 'https://apps.onlykey.io/app/encrypt', icon: '🔒', tip: TOOLTIPS.encryptMessages.text },
  { label: 'Decrypt Messages', href: 'https://apps.onlykey.io/app/decrypt', icon: '🔓', tip: TOOLTIPS.decryptMessages.text },
  { label: 'Encrypt Files', href: 'https://apps.onlykey.io/app/encrypt-file', icon: '📁', tip: TOOLTIPS.encryptFiles.text },
  { label: 'Decrypt Files', href: 'https://apps.onlykey.io/app/decrypt-file', icon: '📂', tip: TOOLTIPS.decryptFiles.text },
  { label: 'Password Vault', href: 'https://apps.onlykey.io/app/vault', icon: '🗝️', tip: TOOLTIPS.vault.text },
];

// One tool: onlykey-agent covers OpenPGP, SSH, Git signing and age, with stored
// or derived keys, so separate "GPG Agent" / "SSH Agent" buttons undersold it.
const AGENT_TOOLS = [
  {
    label: 'OnlyKey Agent',
    href: TOOLTIPS.agent.href,
    icon: '💻',
    tip: TOOLTIPS.agentTool.text,
  },
];

const Tools: React.FC = () => (
  <div className="page-shell">
    <header className="page-header">
      <h2>Tools</h2>
    </header>
    <div className="page-body content-panel">
      <AppUpdateSettings />

      <section className="tools-section">
        <h3 className="tools-section-title">
          Securely use OpenPGP in the browser with OnlyKey WebCrypt{' '}
          <HelpTip href={TOOLTIPS.webcrypt.href} tooltip={TOOLTIPS.webcrypt.text} />
        </h3>
        <div className="tool-btn-grid">
          {WEBCRYPT_TOOLS.map((tool) => (
            <Tooltip key={tool.href} text={tool.tip}>
              <a href={tool.href} target="_blank" rel="noreferrer" className="tool-btn">
                <span className="tool-btn-icon">{tool.icon}</span>
                <span>{tool.label}</span>
              </a>
            </Tooltip>
          ))}
        </div>
      </section>

      <section className="tools-section">
        <h3 className="tools-section-title">
          Securely use OpenPGP, SSH, Git signing and age on a local computer with OnlyKey Agent{' '}
          <HelpTip href={TOOLTIPS.agent.href} tooltip={TOOLTIPS.agent.text} />
        </h3>
        <div className="tool-btn-grid">
          {AGENT_TOOLS.map((tool) => (
            <Tooltip key={tool.href} text={tool.tip}>
              <a href={tool.href} target="_blank" rel="noreferrer" className="tool-btn">
                <span className="tool-btn-icon">{tool.icon}</span>
                <span>{tool.label}</span>
              </a>
            </Tooltip>
          ))}
        </div>
      </section>
    </div>
  </div>
);

export default Tools;