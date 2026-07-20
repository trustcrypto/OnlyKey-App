import React from 'react';
import { TOOLTIPS } from '../data/tooltips';
import { HelpTip } from './ui/HelpTip';
import { Tooltip } from './ui/Tooltip';

const WEBCRYPT_TOOLS = [
  { label: 'Encrypt Messages', href: 'https://apps.crp.to/app/encrypt', icon: '🔒', tip: TOOLTIPS.encryptMessages.text },
  { label: 'Decrypt Messages', href: 'https://apps.crp.to/app/decrypt', icon: '🔓', tip: TOOLTIPS.decryptMessages.text },
  { label: 'Encrypt Files', href: 'https://apps.crp.to/app/encrypt-file', icon: '📁', tip: TOOLTIPS.encryptFiles.text },
  { label: 'Decrypt Files', href: 'https://apps.crp.to/app/decrypt-file', icon: '📂', tip: TOOLTIPS.decryptFiles.text },
];

const AGENT_TOOLS = [
  {
    label: 'OnlyKey GPG Agent',
    href: 'https://docs.crp.to/gpgagentquickstart.html',
    icon: '✉️',
    tip: TOOLTIPS.gpgAgent.text,
  },
  {
    label: 'OnlyKey SSH Agent',
    href: 'https://docs.crp.to/sshagentquickstart.html',
    icon: '▶',
    tip: TOOLTIPS.sshAgent.text,
  },
];

const Tools: React.FC = () => (
  <div className="page-shell">
    <header className="page-header">
      <h2>Tools</h2>
    </header>
    <div className="page-body content-panel">
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
          Securely use OpenPGP and SSH on a local computer with OnlyKey Agent{' '}
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