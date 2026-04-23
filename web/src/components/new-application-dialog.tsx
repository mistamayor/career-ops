"use client";

/**
 * New-application modal. Triggered by the "New application" button on the
 * Pipeline page; shares its zod schema with `createApplicationAction` so
 * validation rules live in exactly one place.
 *
 * On success: closes, toasts, and routes to the detail page for the new
 * record. On failure: keeps the dialog open and shows the server's error
 * in a banner above the form.
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { z } from "zod";

import { createApplicationAction } from "@/app/actions/applications";
import { applicationCreateSchema } from "@/app/actions/applications-schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.input<typeof applicationCreateSchema>;

const STATUS_CHOICES: Array<{ value: FormValues["status"]; label: string }> = [
  { value: "discovered", label: "Discovered" },
  { value: "evaluated", label: "Evaluated" },
  { value: "applied", label: "Applied" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const SOURCE_CHOICES: Array<{
  value: FormValues["jd_source"];
  label: string;
}> = [
  { value: "manual", label: "Manual" },
  { value: "career-ops-scan", label: "Career-Ops scan" },
  { value: "paste", label: "Paste" },
];

export function NewApplicationDialog() {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(applicationCreateSchema),
    defaultValues: {
      company: "",
      role: "",
      jd_url: "",
      jd_text: "",
      jd_source: "manual",
      status: "discovered",
    },
  });

  function onSubmit(values: FormValues) {
    setSubmitError(null);
    const fd = new FormData();
    fd.set("company", values.company);
    fd.set("role", values.role);
    fd.set("jd_url", values.jd_url ?? "");
    fd.set("jd_text", values.jd_text ?? "");
    fd.set("jd_source", values.jd_source ?? "manual");
    fd.set("status", values.status ?? "discovered");

    startTransition(async () => {
      const result = await createApplicationAction(fd);
      if (!result.success) {
        setSubmitError(result.error);
        toast.error(`Failed to create: ${result.error}`);
        return;
      }
      toast.success("Application created");
      setOpen(false);
      form.reset();
      router.push(`/applications/${result.id}`);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        New application
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>
            Create an application manually. Phase 3 will add automatic
            evaluation from a JD URL.
          </DialogDescription>
        </DialogHeader>

        {submitError && (
          <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            {submitError}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl>
                    <Input placeholder="Anthropic" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Member of Technical Staff"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? "discovered"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_CHOICES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="jd_source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? "manual"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SOURCE_CHOICES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="jd_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>JD URL (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jd_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>JD text (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Paste the job description here…"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create application"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
