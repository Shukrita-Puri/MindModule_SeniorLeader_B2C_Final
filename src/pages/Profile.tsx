import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { User, Mail, Shield, CreditCard, Pencil, Calendar, ExternalLink, Database, Lock, Gift, LogOut, Sparkles, MoreVertical, XCircle, Trash2 } from 'lucide-react';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CancellationFlow } from '@/components/subscription/CancellationFlow';
import { clearAllLocalData, getLocalDataSummary } from '@/services/localDataStore';

const tierLabels: Record<string, string> = {
  none: 'Free',
  trial: '7 Day Trial',
  monthly_pro: 'Monthly Pro',
  annual_pro: 'Annual Pro',
};

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut, refreshProfile } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCancelFlow, setShowCancelFlow] = useState(false);
  const [managingPortal, setManagingPortal] = useState(false);
  const [showDeleteLocal, setShowDeleteLocal] = useState(false);

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  const planLabel = tierLabels[user?.subscription_tier || ''] || 'Free';

  const isPaying = ['monthly_pro', 'annual_pro'].includes(user?.subscription_tier || '');
  const isTrialing = user?.subscription_status === 'trialing' || user?.subscription_tier === 'trial';
  const isCanceled = !!user?.subscription_canceled_at;
  const isPendingCancellation = !!user?.subscription_cancel_at && !isCanceled;
  const hasStripeAccount = !!user?.stripe_customer_id;
  const isBetaUser = user?.beta_user && user?.beta_expires_at && new Date(user.beta_expires_at) > new Date();

  const statusLabel = isBetaUser ? 'Beta' : isCanceled ? 'Canceled' : isPaying ? 'Paid' : isTrialing ? 'Trial' : 'Free';

  let expiryLabel: string | null = null;
  if (isBetaUser && user?.beta_expires_at) {
    expiryLabel = `Beta access until ${format(new Date(user.beta_expires_at), 'MMM d, yyyy')}`;
  } else if (isPendingCancellation && user?.subscription_cancel_at) {
    expiryLabel = `Access until ${format(new Date(user.subscription_cancel_at), 'MMM d, yyyy')}`;
  } else if (isCanceled) {
    expiryLabel = 'Access ended';
  } else if (user?.subscription_tier === 'trial' && user.trial_ends_at) {
    expiryLabel = `Trial ends ${format(new Date(user.trial_ends_at), 'MMM d, yyyy')}`;
  } else if (user?.subscription_current_period_end && isPaying) {
    expiryLabel = `Renews ${format(new Date(user.subscription_current_period_end), 'MMM d, yyyy')}`;
  }

  const handleManageBilling = async () => {
    if (!hasStripeAccount) {
      navigate('/onboarding/payment');
      return;
    }
    setManagingPortal(true);
    try {
      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/create-customer-portal`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.ok) {
        const { portalUrl } = await res.json();
        window.open(portalUrl, '_blank');
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404) {
          navigate('/onboarding/payment');
        } else {
          toast.error(err.error || 'Failed to open billing portal');
        }
      }
    } catch {
      toast.error('Failed to open billing portal');
    } finally {
      setManagingPortal(false);
    }
  };

  const handleEditName = () => {
    setNewName(user?.name || '');
    setEditOpen(true);
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/update-profile`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ display_name: newName.trim() }),
        }
      );
      if (res.ok) {
        toast.success('Name updated');
        await refreshProfile();
        setEditOpen(false);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to update name');
      }
    } catch {
      toast.error('Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/signup');
  };

  const handleDeleteLocalData = () => {
    clearAllLocalData();
    setShowDeleteLocal(false);
    toast.success('Local data cleared from this device');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 safe-area-top bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/executive-home')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-headline font-semibold">Profile</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Profile Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.picture} alt={user?.name || 'User'} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-headline font-semibold">{user?.name || 'User'}</h2>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleEditName}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Email</span>
              </div>
              <span className="text-sm">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Status</span>
              </div>
              <span className="text-sm capitalize">{statusLabel}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Plan</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{planLabel}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded hover:bg-muted transition-colors">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/* Upgrade Plan — shown when not paying */}
                    {!isPaying && !isBetaUser && (
                      <DropdownMenuItem onClick={() => navigate('/onboarding/payment')}>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Upgrade Plan
                      </DropdownMenuItem>
                    )}

                    {/* Change Plan — shown when paying */}
                    {isPaying && (
                      <DropdownMenuItem onClick={() => navigate('/onboarding/payment')}>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Change Plan
                      </DropdownMenuItem>
                    )}

                    {/* Manage Billing — shown when Stripe account exists */}
                    {hasStripeAccount && (
                      <DropdownMenuItem onClick={handleManageBilling} disabled={managingPortal}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {managingPortal ? 'Opening…' : 'Manage Billing'}
                      </DropdownMenuItem>
                    )}

                    {/* Cancel Plan — shown when active and not already canceled */}
                    {(isPaying || isTrialing) && !isCanceled && !isPendingCancellation && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => setShowCancelFlow(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Plan
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {expiryLabel && (
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Renewal</span>
                </div>
                <span className="text-sm">{expiryLabel}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Settings</CardTitle>
            <CardDescription>Manage your account preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Manage Plan button */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={isPaying ? handleManageBilling : () => navigate('/onboarding/payment')}
              disabled={managingPortal}
            >
              {isPaying ? (
                <>
                  <ExternalLink className="h-4 w-4" />
                  {managingPortal ? 'Opening…' : 'Manage Plan'}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Upgrade Plan
                </>
              )}
            </Button>

            {/* Connected Data */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/connected-data')}
            >
              <Database className="h-4 w-4" />
              Connected Data Sources
            </Button>

            {/* Privacy & Security */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/privacy')}
            >
              <Lock className="h-4 w-4" />
              Privacy & Security
            </Button>

            {/* Refer */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => navigate('/refer')}
            >
              <Gift className="h-4 w-4" />
              Refer a Friend
            </Button>

            {/* Delete Local Data */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => setShowDeleteLocal(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Local Data
            </Button>

            {/* Sign Out */}
            {user && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Name Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit your name</DialogTitle>
            <DialogDescription>Enter the name you'd like the app to call you.</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Your preferred name"
            maxLength={100}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveName} disabled={saving || !newName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellation Flow */}
      {showCancelFlow && (
        <CancellationFlow
          onClose={() => setShowCancelFlow(false)}
          onCanceled={(endsAt) => {
            setShowCancelFlow(false);
            refreshProfile();
            toast.success(`Your plan will remain active until ${format(new Date(endsAt), 'MMM d, yyyy')}`);
          }}
        />
      )}

      {/* Delete Local Data Confirmation */}
      <Dialog open={showDeleteLocal} onOpenChange={setShowDeleteLocal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Local Data</DialogTitle>
            <DialogDescription>
              This will remove locally stored calendar and wearable data from this device only. Your connected accounts and cloud data will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteLocal(false)}>Cancel</Button>
            <Button className="bg-saffron hover:bg-saffron/90 text-primary-foreground" onClick={handleDeleteLocalData}>
              Delete Local Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
