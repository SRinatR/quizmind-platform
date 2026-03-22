import Link from 'next/link';

import { demoPersonas, personaHref } from '../lib/api';

interface PersonaSwitcherProps {
  currentPersona: string;
  pathname: string;
}

export function PersonaSwitcher({ currentPersona, pathname }: PersonaSwitcherProps) {
  return (
    <div className="persona-switcher">
      {demoPersonas.map((persona) => (
        <Link
          className={persona.key === currentPersona ? 'persona-link active' : 'persona-link'}
          href={personaHref(pathname, persona.key)}
          key={persona.key}
        >
          {persona.label}
        </Link>
      ))}
    </div>
  );
}
