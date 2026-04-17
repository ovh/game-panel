import { useState, type ReactNode } from 'react';
import { KeyRound, Power, X } from 'lucide-react';
import { Icon, type IconName } from '@ovhcloud/ods-react';
import { getAppVersion } from '../utils/appInfo';
import type { AuthUser } from '../utils/permissions';
import {
  AppButton,
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalDescription,
  AppModalHeader,
  AppModalTitle,
} from '../src/ui/components';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  onChangePassword?: () => void;
  canManageUsers?: boolean;
  staticLayout?: boolean;
  currentUser?: AuthUser | null;
}

function LegalSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-b border-white/10 pb-7 last:border-b-0 last:pb-0">
      <div className="border-l-2 border-[var(--color-cyan-400)] pl-4">
        <h3 className="text-lg font-semibold tracking-tight text-white">
          {number}. {title}
        </h3>
      </div>
      <div className="space-y-3 text-sm leading-6 text-slate-200">{children}</div>
    </section>
  );
}

function LegalSubheading({ children }: { children: ReactNode }) {
  return (
    <h4 className="pt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      {children}
    </h4>
  );
}

function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 pl-5 text-slate-200 marker:text-slate-500">
      {items.map((item) => (
        <li key={item} className="list-disc">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Sidebar({
  activeTab,
  onTabChange,
  onLogout,
  onChangePassword,
  canManageUsers = true,
  staticLayout = false,
  currentUser = null,
}: SidebarProps) {
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const layoutClasses = staticLayout ? 'relative h-full' : 'fixed left-0 top-0 h-screen';
  const widthClasses = staticLayout ? 'w-full' : 'w-52';
  const currentUserLabel = currentUser?.username || 'Unknown user';
  const currentUserInitial = currentUserLabel.trim().charAt(0).toUpperCase() || '?';
  const appVersion = getAppVersion();

  const menuItems: Array<{ id: string; label: string; iconName: IconName; disabled?: boolean }> = [
    { id: 'game-servers', label: 'Game Servers', iconName: 'game-controller-alt' },
    { id: 'host-status', label: 'Host Status', iconName: 'analysis' },
    { id: 'admin-users', label: 'User Administration', iconName: 'user', disabled: !canManageUsers },
    { id: 'resources', label: 'Resources', iconName: 'book' },
  ];

  return (
    <aside
      className={`${widthClasses} border-r flex flex-col ${layoutClasses} overflow-y-auto border-white/10 bg-[#111827]`}
    >
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-col items-center justify-center gap-1">
          <div className="h-8 flex items-center justify-center">
            <img
              src="/ovhcloud-logo.png"
              alt="OVHcloud"
              draggable={false}
              className="h-full max-w-[150px] object-contain brightness-0 invert"
            />
          </div>
          <p className="text-sm font-medium leading-none text-gray-200">Game Panel</p>
        </div>
      </div>

      <nav className="p-2 flex-1">
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          const isDisabled = Boolean(item.disabled);

          return (
            <AppButton
              key={item.id}
              onClick={() => {
                if (isDisabled) return;
                onTabChange(item.id);
              }}
              disabled={isDisabled}
              tone={isActive ? 'secondary' : 'ghost'}
              className={`mb-1 flex w-full items-center justify-start gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                isDisabled
                  ? 'text-gray-600 cursor-not-allowed opacity-60'
                  : isActive
                    ? 'border-[var(--gp-primary-300)] bg-[var(--gp-primary-300)] text-[#031126] hover:border-[var(--gp-primary-200)] hover:bg-[var(--gp-primary-200)] hover:text-[#031126]'
                    : 'border-none bg-transparent text-gray-400 hover:bg-gray-800 hover:text-[var(--gp-primary-300)]'
              }`}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon name={item.iconName} className="text-lg leading-none" />
              </span>
              <span className="text-sm font-medium leading-none">{item.label}</span>
            </AppButton>
          );
        })}
      </nav>

      <div className="border-y border-white/10 bg-transparent px-2 py-2.5">
        <div className="mb-2.5 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#324666] bg-[#0f1a2b] text-sm font-semibold text-[var(--color-cyan-400)]">
            {currentUserInitial}
          </div>
          <p
            className="max-w-[120px] truncate text-center text-sm font-semibold text-gray-100"
            title={currentUserLabel}
          >
            {currentUserLabel}
          </p>
        </div>

        <div className="space-y-2">
          <AppButton
            type="button"
            onClick={onChangePassword}
            tone="ghost"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-cyan-400)] bg-[#3b4a63] px-2.5 text-sm font-semibold text-[#eef4fa] transition-colors hover:bg-[#465671]"
            aria-label="Passwords"
            title="Passwords"
          >
            <KeyRound className="h-4 w-4" />
            Passwords
          </AppButton>

          <AppButton
            type="button"
            onClick={onLogout}
            tone="ghost"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#991b4e] bg-[#291126] px-2.5 text-sm font-semibold text-[#e86180] transition-colors hover:bg-[#33152f] hover:text-[#f17993]"
          >
            <Power className="h-4 w-4" />
            Log out
          </AppButton>
        </div>
      </div>

      <div className="px-3 py-3">
        <div className="flex flex-col items-center">
          <h3 className="mb-4 text-xs font-medium text-gray-400">Follow Us</h3>

          <div className="flex items-center justify-center gap-6">
            <a
              href="https://www.reddit.com/r/OVHcloud/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center"
              aria-label="Reddit"
            >
              <img src="/social-reddit.png" alt="Reddit" className="h-5 w-5 object-contain" draggable={false} />
            </a>

            <a
              href="https://x.com/OVHcloud_FR"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center"
              aria-label="X (Twitter)"
            >
              <img src="/social-x.svg" alt="X" className="h-5 w-5 object-contain" draggable={false} />
            </a>

            <a
              href="https://discord.gg/ovhcloud"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center"
              aria-label="Discord"
            >
              <img src="/social-discord.svg" alt="Discord" className="h-5 w-5 object-contain" draggable={false} />
            </a>

            <a
              href="https://www.youtube.com/@OvhGroup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center"
              aria-label="YouTube"
            >
              <img src="/social-youtube.svg" alt="YouTube" className="h-5 w-5 object-contain" draggable={false} />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-3 py-2">
        <div className="flex justify-center">
          <a
            href="https://fr.trustpilot.com/review/ovhcloud.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Trustpilot - OVHcloud"
          >
            <img
              src="/trustpilot.png"
              alt="Trustpilot"
              className="h-5 w-auto object-contain opacity-90"
              draggable={false}
            />
          </a>
        </div>

        <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-500">
          <span>Game Panel v{appVersion}</span>
          <button
            type="button"
            onClick={() => setIsLegalModalOpen(true)}
            className="rounded-sm px-1 text-[10px] text-gray-500 transition-colors hover:text-gray-300"
          >
            Legal
          </button>
        </div>
      </div>

      <AppModal
        open={isLegalModalOpen}
        closeOnInteractOutside={false}
        onOpenChange={setIsLegalModalOpen}
      >
        <AppModalContent
          dismissible={false}
          className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d1524] shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
        >
          <AppModalHeader className="flex items-start justify-between border-b border-white/10 bg-[#101a2d] p-6">
            <div className="space-y-1">
              <AppModalTitle className="text-2xl font-semibold tracking-tight text-white">
                Terms and Conditions, Terms of Use and Privacy Policy
              </AppModalTitle>
              <AppModalDescription className="text-slate-400">
                Version in effect as of: 12/03/2026
              </AppModalDescription>
            </div>
            <AppButton
              type="button"
              tone="ghost"
              onClick={() => setIsLegalModalOpen(false)}
              className="rounded border-none bg-transparent p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-400"
              aria-label="Close legal modal"
            >
              <X className="h-5 w-5" />
            </AppButton>
          </AppModalHeader>

          <AppModalBody className="max-h-[75vh] overflow-y-auto p-0">
            <div className="px-6 py-6">
              <div className="mx-auto max-w-3xl space-y-6">
                <LegalSection number="1" title="Terms and conditions">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <LegalSubheading>Service editor</LegalSubheading>
                      <p>The &quot;OVHcloud Game Panel&quot; is edited by:</p>
                      <div className="space-y-1">
                        <p className="font-semibold text-white">OVHcloud SAS</p>
                        <p>SAS with a capital of EUR50 million</p>
                        <p>RCS Lille Metropole 424 761 419 00045</p>
                        <p>APE code 2620Z</p>
                        <p>VAT NO: FR 22 424 761 419</p>
                        <p>Head office: 2 rue Kellermann - 59100 Roubaix - France</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <LegalSubheading>Hosting</LegalSubheading>
                      <div className="space-y-1">
                        <p className="font-semibold text-white">OVH</p>
                        <p>2 rue Kellermann</p>
                        <p>59100 Roubaix - France</p>
                        <p>Website: https://www.ovhcloud.com</p>
                      </div>
                    </div>
                  </div>

                  <LegalSubheading>Technologies used</LegalSubheading>
                  <p>The Game Panel uses open-source software, including:</p>
                  <LegalList
                    items={['LinuxGSM for the installation and automated management of Linux game servers.']}
                  />
                  <p>Such software shall remain subject to their respective licenses.</p>
                </LegalSection>

                <LegalSection number="2" title="General Terms and Conditions of Use (GTC)">
                  <LegalSubheading>Subject</LegalSubheading>
                  <p>
                    These General Terms and Conditions of Use govern access to and use of the OVHcloud
                    Game Panel service, an interface for managing, administering and deploying game
                    servers.
                  </p>
                  <p>Any use of the service implies full acceptance of these conditions.</p>
                </LegalSection>

                <LegalSection number="3" title="Account creation and management">
                  <p>Access to the service requires:</p>
                  <LegalList
                    items={[
                      'creating a user account',
                      'the use of authentication credentials',
                      'acceptance of these T&Cs',
                    ]}
                  />
                  <p>The user is solely responsible for:</p>
                  <LegalList
                    items={[
                      'the confidentiality of their login details',
                      'the activity carried out from his account',
                      'the security of its access.',
                    ]}
                  />
                  <p>In the event of suspected unauthorized access, the user must immediately inform the publisher.</p>
                </LegalSection>

                <LegalSection number="4" title="User responsibility">
                  <p>
                    The user is fully responsible for the services, content and activities they deploy
                    via the Game Panel.
                  </p>
                  <p>This includes:</p>
                  <LegalList
                    items={[
                      'the game servers installed',
                      'files transferred',
                      'the plugins or mods used',
                      'the content accessible from the servers',
                    ]}
                  />
                  <p>The user guarantees that their use of the service complies with:</p>
                  <LegalList
                    items={[
                      'the legislation in force',
                      'intellectual property rights',
                      'game publisher conditions.',
                    ]}
                  />
                </LegalSection>

                <LegalSection number="5" title="Prohibitions">
                  <p>It is strictly forbidden to use the Game Panel to:</p>
                  <LegalList
                    items={[
                      'Host or distribute illegal content',
                      'infringe copyright or software licenses',
                      'distribute malware or malware',
                      'carry out cyber attacks (DDoS, scanning, intrusion)',
                      'exploit servers for spam or phishing',
                      'use pirated or unauthorized game servers',
                      'bypass the technical limitations of the service.',
                    ]}
                  />
                  <p>The publisher reserves the right to:</p>
                  <LegalList
                    items={[
                      'immediately suspend a service',
                      'restrict access to an account',
                      'delete all illegal content',
                      'Report abuse to the appropriate authorities.',
                    ]}
                  />
                </LegalSection>

                <LegalSection number="6" title="Responsibility for game servers">
                  <p>The Game Panel only provides a technical management tool.</p>
                  <p>The publisher does not intervene in:</p>
                  <LegalList
                    items={[
                      'user administration of the servers',
                      'game configuration',
                      'hosted content',
                      'managing communities or players.',
                    ]}
                  />
                  <p>The user is solely responsible for:</p>
                  <LegalList
                    items={[
                      'managing your server',
                      'Gaming license compliance',
                      'the activities of players connected to its servers',
                      'hosted data',
                    ]}
                  />
                </LegalSection>

                <LegalSection number="7" title="Limitation of Liability">
                  <p>The publisher cannot be held responsible, particularly in the event of:</p>
                  <LegalList
                    items={[
                      'data loss',
                      'incorrect server configuration',
                      'accidental deletion of files',
                      'improper use of the Game Panel (especially via SSH)',
                      'interruption of gaming services',
                      'misuse by third parties',
                      "IT attacks targeting users' servers.",
                    ]}
                  />
                  <p>The user is responsible for setting up their own backups.</p>
                </LegalSection>

                <LegalSection number="8" title="Service availability">
                  <p>The publisher is working hard to ensure that the Game Panel is available.</p>
                  <p>However, the service may be interrupted for:</p>
                  <LegalList
                    items={['maintenance', 'updates', 'technical incidents', 'infrastructure constraints', 'force majeure.']}
                  />
                  <p>No guarantee of permanent availability can be provided.</p>
                </LegalSection>

                <LegalSection number="9" title="Account suspension or deletion">
                  <p>The publisher reserves the right to suspend or delete a user account if:</p>
                  <LegalList
                    items={[
                      'breach of these conditions',
                      'abuse of the service',
                      'illegal activity',
                      'risk to the security of the platform.',
                    ]}
                  />
                  <p>This suspension may take place without notice.</p>
                </LegalSection>

                <LegalSection number="10" title="Intellectual property">
                  <p>All Game Panel elements including:</p>
                  <LegalList items={['source code', 'graphical user interface', 'design', 'documentation']} />
                  <p>are protected by intellectual property laws.</p>
                  <p>Unauthorized reproduction or modification is prohibited.</p>
                  <p>The trademarks and licenses of the games remain the property of their respective publishers.</p>
                </LegalSection>

                <LegalSection number="11" title="Privacy Policy (GDPR)">
                  <LegalSubheading>Collected data</LegalSubheading>
                  <p>The Game Panel can collect the following data:</p>
                  <LegalList
                    items={[
                      'IP address',
                      'user ID',
                      'email address',
                      'system logs',
                      'technical information related to the servers.',
                    ]}
                  />
                  <p>This data is necessary for the operation and security of the service.</p>

                  <LegalSubheading>Purposes of processing</LegalSubheading>
                  <p>The data is used to:</p>
                  <LegalList
                    items={[
                      'allow access to the Game Panel',
                      'secure the platform',
                      'manage servers',
                      'Prevent abuse and intrusion',
                      'improve service performance.',
                    ]}
                  />

                  <LegalSubheading>Legal basis</LegalSubheading>
                  <p>Treatments are based on:</p>
                  <LegalList items={['running the service', 'the legitimate interest of securing the platform.']} />

                  <LegalSubheading>Data conservation</LegalSubheading>
                  <p>The data is stored:</p>
                  <LegalList
                    items={[
                      "for the duration of the service's use",
                      'then for a reasonable period of time for security and legal obligations.',
                    ]}
                  />

                  <LegalSubheading>User rights</LegalSubheading>
                  <p>In compliance with the General Data Protection Regulation (GDPR), users have the following rights:</p>
                  <LegalList
                    items={[
                      'right of access',
                      'right of rectification',
                      'right of deletion',
                      'right of opposition',
                      'right to restriction of processing.',
                    ]}
                  />
                  <p>Requests may be addressed to:</p>
                  <p>[contact email]</p>
                </LegalSection>

                <LegalSection number="12" title="Cookies">
                  <p>
                    The Game Panel may use technical cookies necessary for the platform to work, in
                    particular to:
                  </p>
                  <LegalList items={['authentication', 'Session management', 'security.']} />
                  <p>No advertising cookies are used.</p>
                </LegalSection>

                <LegalSection number="13" title="Modification of the conditions">
                  <p>The publisher reserves the right to modify these conditions at any time.</p>
                  <p>The applicable version is the one published in the Game Panel.</p>
                </LegalSection>

                <LegalSection number="15" title="Network protection and abuse (DDoS, attacks)">
                  <p>
                    The user agrees not to use the resources provided via the Game Panel to carry out
                    or facilitate computer attacks, including:
                  </p>
                  <LegalList
                    items={[
                      'Denial-of-service (DDoS or DoS) attacks',
                      'port scans or intrusion attempts',
                      'exploiting security vulnerabilities',
                      'Using malicious scripts or bots.',
                    ]}
                  />
                  <p>
                    In the event of an attack originating from or targeting a server managed via the
                    Game Panel, the publisher reserves the right to:
                  </p>
                  <LegalList
                    items={[
                      'temporarily suspend the service concerned',
                      'limit network traffic',
                      'block some connections',
                      'suspend or terminate the user account.',
                    ]}
                  />
                  <p>
                    These measures can be taken without notice to protect infrastructure, other users,
                    and third-party networks.
                  </p>
                  <p>
                    The user acknowledges that the hosting infrastructure operated mainly via OVHcloud
                    may apply their own security policies and network restrictions.
                  </p>
                </LegalSection>

                <LegalSection number="16" title="3rd party mods, plugins and content">
                  <p>
                    The Game Panel allows users to install or use third-party mods, plugins,
                    extensions or content for game servers.
                  </p>
                  <p>The user acknowledges that:</p>
                  <LegalList
                    items={[
                      'these contents are installed under his sole responsibility',
                      'the publisher does not guarantee compatibility, security or stability',
                      'Some mods or plugins can compromise the security or operation of the servers.',
                    ]}
                  />
                  <p>The publisher cannot be held liable for any damage resulting from:</p>
                  <LegalList
                    items={[
                      'a faulty plugin',
                      'a malicious mode',
                      'a third-party script',
                      'incorrect configuration by the user.',
                    ]}
                  />
                  <p>The user also agrees not to use violating content:</p>
                  <LegalList items={['copyright', 'software licenses', "game publishers' terms of use."]} />
                </LegalSection>

                <LegalSection number="17" title="Game licensing and publisher compliance">
                  <p>
                    The Game Panel enables the installation and management of video game servers,
                    especially via LinuxGSM.
                  </p>
                  <p>
                    However, the user remains fully responsible for complying with the licenses and
                    conditions of use of the installed games, including:
                  </p>
                  <LegalList
                    items={[
                      'game publisher licenses',
                      'Terms of use for distribution platforms',
                      'rules related to public or commercial servers.',
                    ]}
                  />
                  <p>The publisher of the Game Panel:</p>
                  <LegalList
                    items={[
                      'provides no game licenses',
                      'does not sell or distribute video games',
                      'is not affiliated with the game publishers installed via the platform.',
                    ]}
                  />
                  <p>Any use of unauthorized, pirated or non-compliant versions of games is strictly prohibited.</p>
                  <p>In the event of a violation of the publisher&apos;s terms or applicable laws, the publisher reserves the right to:</p>
                  <LegalList
                    items={[
                      'immediately suspend the server concerned',
                      'delete disputed content',
                      'suspend or delete the user account.',
                    ]}
                  />

                  <LegalSubheading>Contact</LegalSubheading>
                  <p>
                    If you have any questions regarding the service: contact OVHcloud customer support
                    via the OVHcloud Control Panel, or by calling 1007
                  </p>
                </LegalSection>
              </div>
            </div>
          </AppModalBody>
        </AppModalContent>
      </AppModal>
    </aside>
  );
}
