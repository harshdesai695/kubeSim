"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, Lock } from "lucide-react";
import { useClusterStore } from "@/store/useClusterStore";
import type { ConfigMap, Secret } from "@/store/types";

/**
 * ConfigMapNode / SecretNode — small data-carrying boxes (reference doc §5.1–5.2).
 * Connect rightward to the Nodes running pods that consume them.
 */
export function ConfigMapNode({ data }: NodeProps) {
  const cm = (data as { configMap: ConfigMap }).configMap;
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div
      className="w-44 cursor-pointer rounded-lg border border-sky-500/40 bg-panel-850/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
      onClick={() =>
        openDrawer({
          kind: "ConfigMap",
          name: cm.metadata.name,
          id: cm.metadata.uid,
        })
      }
    >
      <div className="flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 text-sky-400" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
          {cm.metadata.name}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] text-slate-500">
        ConfigMap · {Object.keys(cm.data).length} keys
      </p>
      <Handle
        type="source"
        position={Position.Right}
        id="cm-out"
        style={{ opacity: 0, right: -2 }}
      />
    </div>
  );
}

export function SecretNode({ data }: NodeProps) {
  const secret = (data as { secret: Secret }).secret;
  const openDrawer = useClusterStore((s) => s.openDrawer);
  return (
    <div
      className="w-44 cursor-pointer rounded-lg border border-amber-500/40 bg-panel-850/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
      onClick={() =>
        openDrawer({
          kind: "Secret",
          name: secret.metadata.name,
          id: secret.metadata.uid,
        })
      }
    >
      <div className="flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-amber-400" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
          {secret.metadata.name}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] text-slate-500">
        Secret · {Object.keys(secret.data).length} keys ••••
      </p>
      <Handle
        type="source"
        position={Position.Right}
        id="sec-out"
        style={{ opacity: 0, right: -2 }}
      />
    </div>
  );
}
