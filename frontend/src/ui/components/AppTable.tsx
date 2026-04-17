import { Table, type TableProp } from '@ovhcloud/ods-react';
import { cn } from '../utils/cn';

export interface AppTableProps extends TableProp {}

export function AppTable({ className, ...props }: AppTableProps) {
  return <Table className={cn('gp-app-table', className)} {...props} />;
}
