"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight, Flame, Sparkles, Ticket } from "lucide-react";
import {
  DEFAULT_NOTIFICATIONS,
  getNotifications,
  saveNotifications,
  type NotificationKind,
  type SenpaiNotification,
} from "@/lib/notifications";
import { AdSlot } from "@/components/AdSlot";

const ICONS: Record<NotificationKind, typeof Bell> = {
  chapter: Flame,
  recommendation: Sparkles,
  library: Bell,
  referral: Ticket,
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<SenpaiNotification[]>(DEFAULT_NOTIFICATIONS);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => setNotifications(getNotifications()), []);

  const unreadCount = notifications.filter((item) => item.unread).length;
  const visibleNotifications = filter === "unread"
    ? notifications.filter((item) => item.unread)
    : notifications;

  const updateNotifications = (next: SenpaiNotification[]) => {
    setNotifications(next);
    saveNotifications(next);
  };

  const markAllRead = () => {
    updateNotifications(notifications.map((item) => ({ ...item, unread: false })));
  };

  const openNotification = (notification: SenpaiNotification) => {
    if (notification.unread) {
      updateNotifications(notifications.map((item) =>
        item.id === notification.id ? { ...item, unread: false } : item
      ));
    }
    router.push(notification.href);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Updates</p><h1 className="mt-2 text-3xl font-black text-white md:text-4xl">Notifications</h1><p className="mt-2 text-sm text-zinc-400">{unreadCount ? `${unreadCount} unread updates` : "You're all caught up"}</p></div>
        <button onClick={markAllRead} disabled={!unreadCount} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><CheckCheck className="h-4 w-4" /> Mark all read</button>
      </header>

      <div className="mt-7 flex w-fit rounded-2xl border border-white/10 bg-white/[0.03] p-1" aria-label="Notification filters">
        {(["all", "unread"] as const).map((value) => (
          <button key={value} onClick={() => setFilter(value)} className={`min-h-10 rounded-xl px-4 text-sm font-bold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${filter === value ? "bg-primary text-white shadow-[0_8px_24px_rgba(255,46,46,0.2)]" : "text-zinc-400 hover:text-white"}`}>
            {value} <span className="ml-1 text-xs opacity-70">{value === "all" ? notifications.length : unreadCount}</span>
          </button>
        ))}
      </div>

      <section className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[#11131A]">
        {visibleNotifications.length ? visibleNotifications.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <button key={item.id} onClick={() => openNotification(item)} className="group flex w-full items-start gap-4 border-b border-white/5 p-5 text-left transition last:border-b-0 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 md:p-6">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${item.unread ? "bg-primary/15 text-primary" : "bg-white/5 text-zinc-500"}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm text-white md:text-base">{item.title}</strong>{item.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}</span><span className="mt-1 block text-sm leading-6 text-zinc-400">{item.detail}</span></span>
              <span className="flex shrink-0 items-center gap-2 text-[11px] text-zinc-600"><span className="hidden sm:inline">{item.time}</span><ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" /></span>
            </button>
          );
        }) : <div className="px-6 py-16 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-400"><CheckCheck className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-black text-white">You&apos;re all caught up</h2><p className="mt-2 text-sm text-zinc-500">New manga updates will appear here.</p></div>}
      </section>
      <div className="mt-8 border-t border-white/5 pt-8"><AdSlot placement="notifications-bottom" /></div>
    </div>
  );
}
