import {
  Tab,
  TabContent,
  TabList,
  Tabs,
  type TabContentProp,
  type TabListProp,
  type TabProp,
  type TabsProp,
} from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppTabsProps extends Omit<TabsProp, 'onValueChange'> {
  onValueChange?: (value: string) => void;
}

export function AppTabs({ className, onValueChange, ...props }: AppTabsProps) {
  return (
    <Tabs
      className={cn('gp-app-tabs', className)}
      onValueChange={(event) => {
        onValueChange?.(event.value);
      }}
      {...props}
    />
  );
}

export interface AppTabListProps extends TabListProp {}

export function AppTabList({ className, ...props }: AppTabListProps) {
  return <TabList className={cn('gp-app-tab-list', className)} {...props} />;
}

export interface AppTabProps extends TabProp {}

export function AppTab({ className, ...props }: AppTabProps) {
  return <Tab className={cn('gp-app-tab', className)} {...props} />;
}

export interface AppTabContentProps extends TabContentProp {}

export function AppTabContent({ className, ...props }: AppTabContentProps) {
  return <TabContent className={cn('gp-app-tab-content', className)} {...props} />;
}
