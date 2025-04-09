import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Save, Users, Calendar, Bell, Clock, Shield, Lock } from "lucide-react";

interface ShiftSettingsProps {
  open: boolean;
  onClose: () => void;
}

const ShiftSettings: React.FC<ShiftSettingsProps> = ({ open, onClose }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("general");
  
  // Einstellungs-Status
  const [settings, setSettings] = useState({
    // Allgemeine Einstellungen
    notifyOnShiftCreate: true,
    notifyOnShiftUpdate: true,
    notifyOnShiftDelete: true,
    useAutomaticScheduling: false,
    minRestHours: 11,
    maxShiftsPerWeek: 5,
    
    // Berechtigungen
    managerCanCreateTemplates: true,
    managerCanDeleteShifts: true,
    managerCanSetDeadlines: true,
    employeesCanViewTeamShifts: true,
    employeesCanRequestSwap: true,
    
    // Benachrichtigungen
    notificationLeadTime: 24, // Stunden
    requireActionDeadline: 48, // Stunden
    sendEmailNotifications: true,
    sendBrowserNotifications: true,
  });
  
  // Einstellungen ändern
  const updateSettings = (key: string, value: any) => {
    setSettings({
      ...settings,
      [key]: value,
    });
  };
  
  // Einstellungen speichern
  const saveSettings = () => {
    // Hier würde die tatsächliche Speicherung in der Datenbank erfolgen
    
    toast({
      title: "Erfolg",
      description: "Die Einstellungen wurden erfolgreich gespeichert.",
    });
    
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schichtplanungs-Einstellungen</DialogTitle>
          <DialogDescription>
            Konfigurieren Sie die Schichtplanung nach Ihren Anforderungen.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="general">
              <Clock className="h-4 w-4 mr-2" /> Allgemein
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <Shield className="h-4 w-4 mr-2" /> Berechtigungen
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" /> Benachrichtigungen
            </TabsTrigger>
          </TabsList>
          
          {/* Allgemeine Einstellungen */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Schichtplanung</CardTitle>
                <CardDescription>
                  Grundlegende Einstellungen für die Erstellung von Schichtplänen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Automatische Schichtplanung</Label>
                    <p className="text-sm text-muted-foreground">
                      Aktiviert die automatische Zuweisung von Mitarbeitern zu Schichten basierend auf Verfügbarkeit.
                    </p>
                  </div>
                  <Switch
                    checked={settings.useAutomaticScheduling}
                    onCheckedChange={(checked) => updateSettings("useAutomaticScheduling", checked)}
                  />
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minRestHours">Minimale Ruhezeit (Stunden)</Label>
                    <Input
                      id="minRestHours"
                      type="number"
                      min="0"
                      max="24"
                      value={settings.minRestHours}
                      onChange={(e) => updateSettings("minRestHours", parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimale Ruhezeit zwischen zwei Schichten in Stunden.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxShiftsPerWeek">Maximale Schichten pro Woche</Label>
                    <Input
                      id="maxShiftsPerWeek"
                      type="number"
                      min="1"
                      max="7"
                      value={settings.maxShiftsPerWeek}
                      onChange={(e) => updateSettings("maxShiftsPerWeek", parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximale Anzahl an Schichten, die ein Mitarbeiter pro Woche zugewiesen bekommen kann.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Berechtigungen */}
          <TabsContent value="permissions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manager-Berechtigungen</CardTitle>
                <CardDescription>
                  Legen Sie fest, welche Aktionen Manager durchführen dürfen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="manager-templates"
                    checked={settings.managerCanCreateTemplates}
                    onCheckedChange={(checked) => updateSettings("managerCanCreateTemplates", checked)}
                  />
                  <Label htmlFor="manager-templates">Manager können Schichtvorlagen erstellen</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="manager-delete"
                    checked={settings.managerCanDeleteShifts}
                    onCheckedChange={(checked) => updateSettings("managerCanDeleteShifts", checked)}
                  />
                  <Label htmlFor="manager-delete">Manager können Schichten löschen</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="manager-deadlines"
                    checked={settings.managerCanSetDeadlines}
                    onCheckedChange={(checked) => updateSettings("managerCanSetDeadlines", checked)}
                  />
                  <Label htmlFor="manager-deadlines">Manager können Antwortfristen setzen</Label>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Mitarbeiter-Berechtigungen</CardTitle>
                <CardDescription>
                  Legen Sie fest, welche Aktionen Mitarbeiter durchführen dürfen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="employee-team-view"
                    checked={settings.employeesCanViewTeamShifts}
                    onCheckedChange={(checked) => updateSettings("employeesCanViewTeamShifts", checked)}
                  />
                  <Label htmlFor="employee-team-view">Mitarbeiter können Team-Schichten sehen</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="employee-swap"
                    checked={settings.employeesCanRequestSwap}
                    onCheckedChange={(checked) => updateSettings("employeesCanRequestSwap", checked)}
                  />
                  <Label htmlFor="employee-swap">Mitarbeiter können Schichttausch anfragen</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Benachrichtigungen */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Benachrichtigungseinstellungen</CardTitle>
                <CardDescription>
                  Konfigurieren Sie, wann und wie Benachrichtigungen gesendet werden.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notify-create"
                    checked={settings.notifyOnShiftCreate}
                    onCheckedChange={(checked) => updateSettings("notifyOnShiftCreate", checked)}
                  />
                  <Label htmlFor="notify-create">Bei Schichterstellung benachrichtigen</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notify-update"
                    checked={settings.notifyOnShiftUpdate}
                    onCheckedChange={(checked) => updateSettings("notifyOnShiftUpdate", checked)}
                  />
                  <Label htmlFor="notify-update">Bei Schichtänderung benachrichtigen</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notify-delete"
                    checked={settings.notifyOnShiftDelete}
                    onCheckedChange={(checked) => updateSettings("notifyOnShiftDelete", checked)}
                  />
                  <Label htmlFor="notify-delete">Bei Schichtlöschung benachrichtigen</Label>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="notification-lead-time">Vorlaufzeit für Benachrichtigungen (Stunden)</Label>
                    <Input
                      id="notification-lead-time"
                      type="number"
                      min="0"
                      max="72"
                      value={settings.notificationLeadTime}
                      onChange={(e) => updateSettings("notificationLeadTime", parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Wie viele Stunden vor Schichtbeginn soll eine Erinnerung gesendet werden.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="required-action-deadline">Frist für Antwort (Stunden)</Label>
                    <Input
                      id="required-action-deadline"
                      type="number"
                      min="0"
                      max="72"
                      value={settings.requireActionDeadline}
                      onChange={(e) => updateSettings("requireActionDeadline", parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Wie viele Stunden haben Mitarbeiter Zeit, auf eine Schichtzuweisung zu antworten.
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>E-Mail-Benachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Benachrichtigungen per E-Mail senden.
                    </p>
                  </div>
                  <Switch
                    checked={settings.sendEmailNotifications}
                    onCheckedChange={(checked) => updateSettings("sendEmailNotifications", checked)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Browser-Benachrichtigungen</Label>
                    <p className="text-sm text-muted-foreground">
                      Benachrichtigungen im Browser anzeigen.
                    </p>
                  </div>
                  <Switch
                    checked={settings.sendBrowserNotifications}
                    onCheckedChange={(checked) => updateSettings("sendBrowserNotifications", checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={saveSettings}>
            <Save className="h-4 w-4 mr-2" />
            Einstellungen speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShiftSettings; 