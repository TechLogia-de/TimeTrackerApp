import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import ContractHoursSettings from "@/components/time/ContractHoursSettings";
import { Button } from "@/components/ui/button";
import { UserContract } from "@/types/user";
import { userContractService } from "@/lib/db/userContracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const UserWorkHoursSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userContract, setUserContract] = useState<UserContract | null>(null);

  // Lade Benutzerdaten und Vertragsdetails
  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.uid) {
        toast({
          title: "Nicht angemeldet",
          description: "Bitte melden Sie sich an, um Ihre Arbeitszeiten einzusehen.",
          variant: "destructive",
        });
        navigate("/login");
        return;
      }

      try {
        setLoading(true);
        // Lade den Vertrag des Benutzers
        const contract = await userContractService.getUserContract(user.uid);
        setUserContract(contract);
      } catch (error) {
        toast({
          title: "Fehler",
          description: "Die Daten konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      loadUserData();
    }
  }, [user, authLoading, navigate, toast]);

  // Callbacks
  const handleSaved = () => {
    toast({
      title: "Erfolg",
      description: "Ihre Arbeitszeiten wurden gespeichert und werden im Zeitkonto berücksichtigt.",
    });
    
    // Aktualisiere lokale Daten, um sofortige Feedback-Schleife zu schließen
    if (user?.uid) {
      setTimeout(() => {
        userContractService.getUserContract(user.uid)
          .then(updatedContract => {
            if (updatedContract) {
              setUserContract(updatedContract);
            }
          })
          .catch(error => console.error("Fehler beim Nachladen des Vertrags:", error));
      }, 500);
    }
  };

  const handleContractUpdated = (contract: UserContract) => {
    // Aktualisiere den Vertrag in der Komponente
    setUserContract(contract);
    
    // Trigger für eventuelle globale Zustandsmanager oder Kontext-Provider
    window.dispatchEvent(new CustomEvent('contractUpdated', { 
      detail: { userId: user?.uid, contract } 
    }));
  };

  // Lade-Anzeige
  if (loading || authLoading) {
    return (
      <div className="container max-w-5xl mx-auto p-8">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Arbeitszeiten werden geladen</CardTitle>
            <CardDescription>Bitte warten Sie einen Moment...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 sm:p-8">
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Meine Arbeitszeiten</CardTitle>
            <Button 
              variant="outline" 
              onClick={() => navigate(-1)}
            >
              Zurück
            </Button>
          </div>
          <CardDescription>
            Hier können Sie Ihre wöchentliche Arbeitszeit und Arbeitstage festlegen
          </CardDescription>
        </CardHeader>
      </Card>

      <ContractHoursSettings
        userId={user?.uid}
        onSaved={handleSaved}
        onContractUpdated={handleContractUpdated}
      />
    </div>
  );
};

export default UserWorkHoursSettings; 