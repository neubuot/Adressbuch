/**
 * Bausteine für den einheitlichen Seitenaufbau
 */

import { useEffect } from 'react';

interface PageProps {
  title: string;
  lead?: React.ReactNode;
  /** Ziel und Beschriftung des Zurück-Links */
  back?: { href: string; label: string };
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const Page: React.FC<PageProps> = ({ title, lead, back, action, children }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <header className="page-head">
        {back && (
          <a className="back" href={back.href}>
            <span aria-hidden="true">←&nbsp;</span>
            {back.label}
          </a>
        )}
        <div className="page-head-row">
          <h2 className="page-title">{title}</h2>
          {action}
        </div>
        {lead && <p className="page-lead">{lead}</p>}
      </header>
      {children}
    </>
  );
};

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="section">
    <h3 className="section-title">{title}</h3>
    {children}
  </section>
);

export const Avatar: React.FC<{ name: string; large?: boolean }> = ({ name, large }) => {
  const parts = name.split(/\s+/).filter((part) => /^\p{L}/u.test(part));
  const initials =
    parts.length === 0
      ? '?'
      : (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('de');
  return (
    <span className={`avatar${large ? ' avatar-l' : ''}`} aria-hidden="true">
      {initials}
    </span>
  );
};
