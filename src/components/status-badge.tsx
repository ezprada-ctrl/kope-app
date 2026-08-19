import { UNIT_STATUS_LABEL, UNIT_STATUS_TONE } from "@/lib/unit-status";
import type { UnitStatus } from "@/types/database";

export default function StatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${UNIT_STATUS_TONE[status]}`}
    >
      {UNIT_STATUS_LABEL[status]}
    </span>
  );
}
