import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAchievements } from "@/hooks/useAchievements";
import { Loader2 } from "lucide-react";

interface CertificateRequestModalProps {
  achievementId: string;
  onClose: () => void;
}

const CertificateRequestModal = ({ achievementId, onClose }: CertificateRequestModalProps) => {
  const { requestCertificate, definitions } = useAchievements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mailingAddress: '',
    city: '',
    country: '',
    postalCode: ''
  });

  const achievement = definitions.find(d => d.id === achievementId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSubmitting(true);
      await requestCertificate({
        achievementId,
        fullName: formData.fullName,
        email: formData.email,
        mailingAddress: formData.mailingAddress,
        city: formData.city,
        country: formData.country,
        postalCode: formData.postalCode
      });
      onClose();
    } catch (err) {
      console.error('Failed to submit certificate request:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Physical Certificate</DialogTitle>
          <DialogDescription>
            Congratulations on earning the {achievement?.name}! Fill in your details below to receive your physical certificate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name (as it should appear on certificate)</Label>
            <Input
              id="fullName"
              value={formData.fullName}
              onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
              required
              placeholder="John Smith"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              placeholder="john@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailingAddress">Mailing Address</Label>
            <Input
              id="mailingAddress"
              value={formData.mailingAddress}
              onChange={(e) => setFormData(prev => ({ ...prev, mailingAddress: e.target.value }))}
              required
              placeholder="123 Main Street, Apt 4"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                placeholder="London"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                value={formData.postalCode}
                onChange={(e) => setFormData(prev => ({ ...prev, postalCode: e.target.value }))}
                placeholder="SW1A 1AA"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
              placeholder="United Kingdom"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Request Certificate'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CertificateRequestModal;
