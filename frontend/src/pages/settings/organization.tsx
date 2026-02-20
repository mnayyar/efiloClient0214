import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Upload, X, Building2, Palette } from "lucide-react";

interface OrgData {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  primaryColor: string;
  billingEmail: string;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string;
  replyToDomain: string | null;
}

export function OrganizationSettingsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#C67F17");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("US");
  const [replyToDomain, setReplyToDomain] = useState("");

  const fetchOrg = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/organization", {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          setForbidden(true);
          return;
        }
        throw new Error("Failed to fetch organization");
      }
      const data = await res.json();
      const o: OrgData = data.data;
      setOrg(o);
      setName(o.name);
      setBillingEmail(o.billingEmail);
      setPrimaryColor(o.primaryColor);
      setStreet(o.street ?? "");
      setStreet2(o.street2 ?? "");
      setCity(o.city ?? "");
      setState(o.state ?? "");
      setZipCode(o.zipCode ?? "");
      setCountry(o.country);
      setReplyToDomain(o.replyToDomain ?? "");
    } catch {
      toast.error("Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          billingEmail,
          primaryColor,
          street: street || null,
          street2: street2 || null,
          city: city || null,
          state: state || null,
          zipCode: zipCode || null,
          country,
          replyToDomain: replyToDomain || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || data.error || "Failed to save.");
        return;
      }

      setOrg(data.data);
      toast.success("Organization settings saved.");
    } catch {
      toast.error("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/settings/organization/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || data.error || "Failed to upload logo.");
        return;
      }

      setOrg((prev) => (prev ? { ...prev, logo: data.data.logo } : prev));
      toast.success("Logo uploaded.");
    } catch {
      toast.error("Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleLogoRemove() {
    try {
      const res = await fetch("/api/settings/organization/logo", {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.detail || data.error || "Failed to remove logo.");
        return;
      }

      setOrg((prev) => (prev ? { ...prev, logo: null } : prev));
      toast.success("Logo removed.");
    } catch {
      toast.error("Failed to remove logo.");
    }
  }

  if (forbidden || (currentUser && currentUser.role !== "ADMIN")) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-text-secondary">
          You don&apos;t have permission to access this page.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-text-secondary">
        Loading organization settings...
      </div>
    );
  }

  if (!org) {
    return (
      <div className="py-12 text-center text-text-secondary">
        Organization not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company Logo
          </CardTitle>
          <CardDescription>
            Your logo appears in the sidebar and reports. Max 2 MB. PNG, JPEG,
            SVG, or WebP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-card-border bg-background overflow-hidden">
              {org.logo ? (
                <img
                  src={org.logo}
                  alt="Company logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <Building2 className="h-8 w-8 text-text-secondary" />
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-3.5 w-3.5" />
                {uploadingLogo ? "Uploading..." : "Upload"}
              </Button>
              {org.logo && (
                <Button variant="ghost" size="sm" onClick={handleLogoRemove}>
                  <X className="mr-2 h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Organization Details
          </CardTitle>
          <CardDescription>
            Company information, branding, and address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="org-name">Company Name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={org.slug}
                  disabled
                  className="opacity-60"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="org-email">Billing Email</Label>
                <Input
                  id="org-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="org-noreply-email">No-Reply Email</Label>
                <Input
                  id="org-noreply-email"
                  type="email"
                  value={replyToDomain}
                  onChange={(e) => setReplyToDomain(e.target.value)}
                  placeholder="noreply@example.com"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="org-color">Brand Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="org-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-card-border p-0.5"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                      setPrimaryColor(v);
                    }
                  }}
                  className="w-28 font-mono text-sm"
                  maxLength={7}
                />
                <div
                  className="h-9 w-9 rounded border border-card-border"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium text-text-primary mb-3">
                Address
              </h3>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-street">Street</Label>
                  <Input
                    id="org-street"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="org-street2">Street Line 2</Label>
                  <Input
                    id="org-street2"
                    value={street2}
                    onChange={(e) => setStreet2(e.target.value)}
                    placeholder="Suite 100"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="org-city">City</Label>
                    <Input
                      id="org-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="org-state">State</Label>
                    <Input
                      id="org-state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="org-zip">ZIP Code</Label>
                    <Input
                      id="org-zip"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:max-w-[200px]">
                  <Label htmlFor="org-country">Country</Label>
                  <Input
                    id="org-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
