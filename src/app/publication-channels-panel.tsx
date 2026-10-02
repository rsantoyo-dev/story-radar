"use client";

import { useEffect, useState } from "react";

import { InstagramPublicationCandidatePanel, type BlockerTarget } from "./instagram-publication-candidate-panel";
import type { PublicationChannel } from "./modules/meta/publication-channel";
import { InlineNotice, LoadingState } from "./ui/primitives";

type InstagramStatus = { connected: boolean; igUsername?: string };
type FacebookStatus = { connected: boolean; pageName?: string; linkedIgUserId?: string; linkedIgUsername?: string };
export type ChannelOption = { channel: PublicationChannel; accountHint?: string };

/** The Topic's connected publishing channels (Page, its Instagram, direct Instagram). */
export function useConnectedPublicationChannels(topicId: string, secret: string) {
  const [options, setOptions] = useState<ChannelOption[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const headers = { Authorization: `Bearer ${secret.trim()}` };
    const base = `/api/radar/topics/${encodeURIComponent(topicId)}/meta`;
    const read = async <T,>(url: string): Promise<T | undefined> => {
      const response = await fetch(url, { cache: "no-store", headers, signal: controller.signal });
      return response.ok ? ((await response.json()) as T) : undefined;
    };
    Promise.all([read<InstagramStatus>(base), read<FacebookStatus>(`${base}/facebook`)])
      .then(([instagram, facebook]) => {
        if (controller.signal.aborted) return;
        setOptions(channelOptions(instagram, facebook));
      })
      .catch(() => { if (!controller.signal.aborted) setError("The connected channels could not be loaded. Reload to try again."); });
    return () => controller.abort();
  }, [topicId, secret]);
  return { options, error };
}

/**
 * PUB-10: one publication review per connected Meta channel. With a connected
 * Facebook Page, the topic publishes through Meta — the Page and its linked
 * Instagram account — as independent deliveries. The direct Instagram
 * connection is offered only when it is not that same Instagram account, so
 * one account is never offered twice.
 */
export function PublicationChannelsPanel({ topicId, draftId, batchId, secret, disabled, onGoToBlocker }: {
  topicId: string;
  draftId: string;
  batchId: string;
  secret: string;
  disabled?: boolean;
  onGoToBlocker?: (target: BlockerTarget) => void;
}) {
  const { options, error } = useConnectedPublicationChannels(topicId, secret);

  if (error) return <InlineNotice tone="error">{error}</InlineNotice>;
  if (!options) return <LoadingState>Checking connected channels…</LoadingState>;
  if (!options.length) {
    return <InlineNotice tone="warning" title="No publishing channel connected">Connect the topic&rsquo;s Facebook Page (or its Instagram account) in Channels, then return here to publish.</InlineNotice>;
  }
  return <>
    {options.map((option) => <InstagramPublicationCandidatePanel
      key={option.channel}
      topicId={topicId} draftId={draftId} batchId={batchId} secret={secret} disabled={disabled}
      channel={option.channel} accountHint={option.accountHint} onGoToBlocker={onGoToBlocker}
    />)}
  </>;
}

function channelOptions(instagram?: InstagramStatus, facebook?: FacebookStatus): ChannelOption[] {
  const options: ChannelOption[] = [];
  if (facebook?.connected) {
    options.push({ channel: "facebook-page", accountHint: facebook.pageName });
    if (facebook.linkedIgUserId) {
      options.push({ channel: "instagram-page", accountHint: facebook.linkedIgUsername ? `@${facebook.linkedIgUsername}` : undefined });
    }
  }
  const sameInstagramAccount = Boolean(
    facebook?.linkedIgUsername && instagram?.igUsername &&
      facebook.linkedIgUsername.toLowerCase() === instagram.igUsername.toLowerCase(),
  );
  if (instagram?.connected && !sameInstagramAccount) {
    options.push({ channel: "instagram-direct", accountHint: instagram.igUsername ? `@${instagram.igUsername}` : undefined });
  }
  return options;
}
