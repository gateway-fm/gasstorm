import { Card } from '../../components/layout/Card';
import { TransferTokenForm } from './TransferTokenForm';

export function TransferTokenCard() {
  return (
    <Card className="w-full sm:w-[31rem]">
      <TransferTokenForm />
    </Card>
  );
}
