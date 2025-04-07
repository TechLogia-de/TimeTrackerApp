import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { addOrder, updateOrder } from "@/lib/services/orderService";
import { cn } from "@/lib/utils";
import { Order, AssignedUser } from "@/lib/services/orderService";
import { CalendarIcon, Check, ChevronsUpDown, X, Brain, Loader2, ChevronDown, ChevronUp, Search, Star, User, Wrench, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Timestamp } from "firebase/firestore";
import { useAuftragsKI } from "@/hooks/useAuftragsKI";
import { useSettings } from "@/lib/hooks/useSettings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeSuggestions } from '@/components/employees/EmployeeSuggestions';
import { CustomerSelect } from '@/components/customers/CustomerSelect';
import { TestDataDialog } from '@/components/dev/TestDataDialog';
import { AIAssistantDialog } from '@/components/dev/AIAssistantDialog';
import { ProjectService } from '@/lib/services/projectService';

// Füge einen benannten Export hinzu
export { OrderDialog };

// Erweiterte MitarbeiterVorschlag-Schnittstelle
interface MitarbeiterVorschlag {
  id: string;
  name: string;
  skills?: string[];
  passt?: string;
  teamLeadEmpfehlung?: boolean;
}

// Erweiterte AIResponse-Schnittstelle
interface AIResponse {
  kunde: string;
  projekt: string;
  kategorie: string;
  prioritaet: string;
  vorschlägeAnwendbar: boolean;
  passendeMitarbeiter?: MitarbeiterVorschlag[];
  kundenDetails?: {
    industry?: string;
    contactPerson?: string;
    notes?: string;
  };
  projektDetails?: {
    status?: string;
    type?: string;
    description?: string;
  };
}

// Definiere User-Typ direkt hier
interface User {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

// Projekt-Interface
interface Project {
  id: string;
  name: string;
  customerId?: string;
}

// Kunden-Interface
interface Customer {
  id: string;
  name: string;
}

interface OrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order;
  onSubmit?: (data: any) => void;
  availableCustomers?: Customer[];
  availableProjects?: Project[];
  availableEmployees?: Array<{ id: string; name: string; role?: string }>;
  userRole?: "admin" | "manager" | "employee";
}

// Lokales FormData-Interface für zusätzliche Felder
interface OrderFormData {
  title: string;
  customer: string;
  customerId?: string;
  project: string;
  projectId?: string;
  description: string;
  priority: string;
  startDate: Date | null;
  startTime?: string;
  endDate: Date | null;
  endTime?: string; // Neue Eigenschaft für Endzeit
  confirmationDeadline: Date | null;
  confirmationTime?: string; // Neue Eigenschaft für Bestätigungsfrist-Uhrzeit
  status: string;
  category?: string;
  // Zusätzliche Felder, die nicht im Order-Interface sind
  notes?: string;
  estimatedTime: number;
}

const OrderDialog = ({ 
  isOpen, 
  onClose, 
  order, 
  onSubmit, 
  availableCustomers = [], 
  availableProjects = [],
  availableEmployees = [],
  userRole = "employee"
}: OrderDialogProps) => {
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [teamLeadId, setTeamLeadId] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Array<{ id: string; name: string; role?: string }>>(availableEmployees);
  const [formData, setFormData] = useState<OrderFormData>({
    title: "",
    customer: "",
    customerId: "",
    project: "",
    projectId: "",
    description: "",
    priority: "Mittel",
    startDate: null,
    startTime: "",
    endDate: null,
    endTime: "",
    confirmationDeadline: null,
    confirmationTime: "",
    status: "pending",
    category: "",
    notes: "",
    estimatedTime: 0,
  });
  
  // Validierung der Pflichtfelder
  const [formErrors, setFormErrors] = useState({
    title: false,
    customer: false,
    project: false,
  });
  
  // Filtere Projekte nach ausgewähltem Kunden
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  
  // KI-Funktionalität
  const { getVorschlaege, loading: aiLoading, error: aiError } = useAuftragsKI();
  const { settings } = useSettings();
  const [aiSuggestions, setAiSuggestions] = useState<AIResponse | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [applySuggestions, setApplySuggestions] = useState(false);
  const [useDevelopmentMode, setUseDevelopmentMode] = useState(false); // Entwicklermodus-State
  const [showTestDataDialog, setShowTestDataDialog] = useState(false); // Dialog für Testdaten
  const [useAIAssistant, setUseAIAssistant] = useState(false); // AI-Assistent-State
  const [showAIDialog, setShowAIDialog] = useState(false); // Dialog für AI-Einstellungen
  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    selectedModel: "gpt-4",
    temperature: 0.7,
    maxTokens: 800,
    autoSuggest: true,
    rememberContext: true,
    assistantRoles: {
      projectSuggestions: true,
      employeeSuggestions: true,
      customerSuggestions: true,
      orderAnalysis: true
    },
    customPrompt: "",
    customPersona: "Freundlich und hilfsbereit, spricht Deutsch und ist auf Effizienz bedacht."
  });
  const [testData, setTestData] = useState({
    mitarbeiter: [
      {
        id: 'dev1',
        name: 'Alexander Schmidt',
        skills: ['Frontend', 'React', 'TypeScript'],
        role: 'developer',
        teamLead: true
      },
      {
        id: 'cloud1',
        name: 'Thomas Wagner',
        skills: ['Cloud', 'AWS', 'DevOps'],
        role: 'devops',
        teamLead: false
      },
      {
        id: 'pm1',
        name: 'Daniel Hoffmann',
        skills: ['Projektmanagement', 'Agile', 'Scrum'],
        role: 'manager',
        teamLead: false
      },
    ],
    kunde: {
      name: "Tech Solutions GmbH",
      address: "Technologiepark 5, 10115 Berlin",
      contactPerson: "Dr. Michael Weber",
      email: "info@tech-solutions.example",
      phone: "+49 30 1234567",
      website: "https://tech-solutions.example",
      notes: "Langjähriger Kunde, spezialisiert auf Cloud-Lösungen",
      industry: "IT & Software"
    },
    projekt: {
      name: "Cloud-Migration 2024",
      description: "Migration der On-Premise-Infrastruktur in die AWS-Cloud",
      customerId: "gWygwmuubvS4fJPd6bIP",
      status: "Aktiv",
      type: "Infrastruktur-Projekt",
      budget: "75.000 €",
      deadline: "2024-12-31"
    }
  });
  
  // Prüfen, ob KI-Funktionalität aktiviert ist
  const isAiEnabled = settings?.features?.ai?.enabled || false;
  
  // Einfache Version mit optionaler Verkettung
  const hasAiAccess = isAiEnabled && (
    (userRole === 'admin' && settings?.features?.ai?.roles?.admin) || 
    (userRole === 'manager' && settings?.features?.ai?.roles?.manager) || 
    (userRole === 'employee' && (settings?.features?.ai?.roles?.employee || settings?.features?.ai?.roles?.mitarbeiter))
  );

  // Jetzt zeigen wir den KI-Button nur, wenn es ein neuer Auftrag ist
  const isNewOrder = !order?.id;
  const [showAiButton, setShowAiButton] = useState(false); // Auf false statt automatisch isNewOrder
  
  // Update filteredEmployees wenn sich availableEmployees ändert oder bei Suche
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredEmployees(availableEmployees);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredEmployees(
        availableEmployees.filter(emp => 
          emp.name.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, availableEmployees]);
  
  // KI-Button anzeigen, wenn Kunde und Projekt gewählt wurden
  useEffect(() => {
    if (isNewOrder && hasAiAccess && formData.customerId && formData.projectId) {
      setShowAiButton(true);
    } else {
      setShowAiButton(false);
    }
  }, [isNewOrder, hasAiAccess, formData.customerId, formData.projectId]);
  
  // Lade Daten aus dem übergebenen Auftrag, wenn vorhanden
  useEffect(() => {
    if (order) {
      console.log("Initializing order:", order); // Debug: Um zu sehen, was übergeben wird
      const initialFormValues = {
        ...order,
        assignedTo: order.assignedTo || [],
        date: order.date instanceof Date ? order.date : (order.date instanceof Timestamp ? order.date.toDate() : new Date(order.date)),
        startDate: order.startDate ? (order.startDate instanceof Date ? order.startDate : (order.startDate instanceof Timestamp ? order.startDate.toDate() : new Date(order.startDate))) : new Date(),
        endDate: order.endDate ? (order.endDate instanceof Date ? order.endDate : (order.endDate instanceof Timestamp ? order.endDate.toDate() : new Date(order.endDate))) : new Date(),
        confirmationDeadline: order.confirmationDeadline ? (order.confirmationDeadline instanceof Date ? order.confirmationDeadline : (order.confirmationDeadline instanceof Timestamp ? order.confirmationDeadline.toDate() : new Date(order.confirmationDeadline))) : new Date(),
        assignee: Array.isArray(order.assignedTo) ? order.assignedTo : (typeof order.assignedTo === "string" ? [order.assignedTo] : []),
        category: order.category || "",
        notes: "",
        estimatedTime: order.estimatedTime || 0,
        customer: order.client || "",
        project: order.project || "",
        priority: order.priority || "Mittel" // Standardwert für priority
      };
      
      setFormData(initialFormValues);
      
      // Setze zugewiesene Benutzer, wenn vorhanden
      if (order.assignedUsers && Array.isArray(order.assignedUsers)) {
        setAssignedUsers(order.assignedUsers);
        
        // Setze Teamleiter, wenn vorhanden
        const teamLead = order.assignedUsers.find(user => user.isTeamLead);
        if (teamLead) {
          setTeamLeadId(teamLead.id);
        } else if (order.teamLeadId) {
          setTeamLeadId(order.teamLeadId);
        }
      }

      console.log("Customer ID:", formData.customerId);
      console.log("Available projects:", availableProjects);
      console.log("Filtered projects:", filteredProjects);
    }
  }, [order]);
  
  // Update filteredProjects wenn sich der ausgewählte Kunde ändert
  useEffect(() => {
    if (formData.customerId) {
      setFilteredProjects(
        availableProjects.filter(project => 
          project.customerId === formData.customerId || !project.customerId
        )
      );
    } else {
      setFilteredProjects(availableProjects);
    }
  }, [formData.customerId, availableProjects]);
  
  // Funktion zum Generieren von KI-Vorschlägen aktualisieren
  const generateAiSuggestions = async () => {
    if (!formData.title) {
      toast({
        title: "Titel erforderlich",
        description: "Bitte geben Sie einen Titel ein, um KI-Vorschläge zu erhalten.",
        variant: "destructive",
      });
      return;
    }
    
    // Nur Mitarbeiter mit der Rolle "employee" oder "mitarbeiter" filtern
    const filteredEmployees = availableEmployees.filter(emp => 
      emp.role?.toLowerCase() === 'employee' || 
      emp.role?.toLowerCase() === 'mitarbeiter' ||
      !emp.role // Falls keine Rolle angegeben ist, trotzdem einbeziehen
    );
    
    // Mitarbeiterdaten in der Konsole ausgeben
    console.log("Sende Mitarbeiterdaten an API:", filteredEmployees);
    
    // Prüfe, wie viele Parameter getVorschlaege unterstützt
    const suggestions = await getVorschlaege(
      formData.title, 
      formData.description,
      formData.customerId,
      formData.projectId,
      useDevelopmentMode,
      filteredEmployees // Jetzt werden nur die gefilterten Mitarbeiter übergeben
    );
    
    // Rest der Funktion bleibt gleich
    if (suggestions) {
      setAiSuggestions(suggestions);
      setShowSuggestions(true);
      
      if (suggestions.vorschlägeAnwendbar) {
        setApplySuggestions(true);
      }
      
      if (suggestions.passendeMitarbeiter && suggestions.passendeMitarbeiter.length > 0) {
        handleMitarbeiterVorschlaege(suggestions.passendeMitarbeiter);
      }
    }
  };
  
  // Funktion zum Verarbeiten der Mitarbeitervorschläge
  const handleMitarbeiterVorschlaege = (vorschlaege: MitarbeiterVorschlag[]) => {
    if (!vorschlaege || !availableEmployees) return;
    
    // Versuche, die vorgeschlagenen Mitarbeiter-IDs mit verfügbaren Mitarbeitern abzugleichen
    // und automatisch diejenigen auszuwählen, die übereinstimmen
    const newAssignedUsers = [...assignedUsers]; // Kopie erstellen
    let teamLeadSelected = false;
    
    vorschlaege.forEach(vorschlag => {
      // Versuche, den Mitarbeiter in der verfügbaren Liste zu finden
      const matchedEmployee = availableEmployees.find(emp => 
        emp.name.toLowerCase() === vorschlag.name.toLowerCase() || 
        emp.id === vorschlag.id
      );
      
      // Prüfen, ob der Mitarbeiter die Rolle "employee" oder "mitarbeiter" hat
      if (matchedEmployee && 
          !newAssignedUsers.some(u => u.id === matchedEmployee.id) &&
          (matchedEmployee.role?.toLowerCase() === 'employee' || 
           matchedEmployee.role?.toLowerCase() === 'mitarbeiter' ||
           !matchedEmployee.role)) {
        // Füge den Mitarbeiter zu den ausgewählten hinzu
        newAssignedUsers.push({
          id: matchedEmployee.id,
          name: matchedEmployee.name,
          status: "pending",
          isTeamLead: vorschlag.teamLeadEmpfehlung && !teamLeadSelected,
          notify: true // Standardmäßig E-Mail-Benachrichtigungen aktivieren
        });
        
        // Wenn dieser Mitarbeiter als Teamleiter empfohlen wird und noch keiner ausgewählt ist
        if (vorschlag.teamLeadEmpfehlung && !teamLeadSelected) {
          setTeamLeadId(matchedEmployee.id);
          teamLeadSelected = true;
        }
      }
    });
    
    if (newAssignedUsers.length > assignedUsers.length) {
      setAssignedUsers(newAssignedUsers);
      toast({
        title: "Mitarbeitervorschläge",
        description: `${newAssignedUsers.length - assignedUsers.length} Mitarbeiter wurden basierend auf KI-Vorschlägen hinzugefügt.`,
      });
    }
  };
  
  // Funktion zum Anwenden der KI-Vorschläge
  const handleApplySuggestions = () => {
    if (aiSuggestions && applySuggestions) {
      // Finde passenden Kunden aus Liste oder setze nur den Namen
      const matchedCustomer = availableCustomers.find(
        customer => customer.name.toLowerCase() === aiSuggestions.kunde.toLowerCase()
      );
      
      // Finde passendes Projekt aus Liste oder setze nur den Namen
      const matchedProject = availableProjects.find(
        project => project.name.toLowerCase() === aiSuggestions.projekt.toLowerCase()
      );
      
      setFormData(prev => ({
        ...prev,
        customer: matchedCustomer?.name || aiSuggestions.kunde,
        customerId: matchedCustomer?.id || "",
        project: matchedProject?.name || aiSuggestions.projekt,
        projectId: matchedProject?.id || "",
        priority: mapPriorityToFormValue(aiSuggestions.prioritaet),
        category: aiSuggestions.kategorie || prev.category,
        // estimatedTime: aiSuggestions.estimatedTime || 0, // KI hat keine Schätzung der Zeit
      }));
      
      // Zurücksetzen der Validierungsfehler, wenn Werte gesetzt wurden
      setFormErrors(prev => ({
        ...prev,
        customer: false,
        project: false,
      }));
      
      toast({
        title: "Vorschläge übernommen",
        description: "Die KI-Vorschläge wurden in das Formular übernommen.",
      });
    }
  };
  
  // Hilfsfunktion zum Mappen der KI-Priorität auf Formularwerte
  const mapPriorityToFormValue = (prioritaet: string): string => {
    switch (prioritaet.toLowerCase()) {
      case 'niedrig':
      case 'low':
        return 'Niedrig';
      case 'mittel':
      case 'medium':
        return 'Mittel';
      case 'hoch':
      case 'high':
      case 'kritisch':
      case 'critical':
        return 'Hoch';
      default:
        return 'Mittel';
    }
  };
  
  // Funktionen für die Mitarbeiterzuweisung
  const toggleAssignedUser = (userId: string, userName: string) => {
    setAssignedUsers(prev => {
      const isAlreadyAssigned = prev.some(user => user.id === userId);
      
      if (isAlreadyAssigned) {
        // Entferne Benutzer, falls bereits zugewiesen
        // Wenn der Benutzer Teamleiter war, setze TeamLeadId zurück
        if (teamLeadId === userId) {
          setTeamLeadId(null);
        }
        return prev.filter(user => user.id !== userId);
      } else {
        // Füge Benutzer hinzu, falls noch nicht zugewiesen
        return [...prev, { 
          id: userId, 
          name: userName,
          status: "pending",
          isTeamLead: false,
          notify: true // Standardmäßig E-Mail-Benachrichtigungen aktivieren
        }];
      }
    });
  };
  
  // Teamleiter festlegen
  const setTeamLead = (userId: string) => {
    // Stelle sicher, dass der Benutzer zugewiesen ist
    if (!assignedUsers.some(user => user.id === userId)) {
      return;
    }
    
    // Setze den Teamleiter und aktualisiere die zugewiesenen Benutzer
    setTeamLeadId(userId);
    setAssignedUsers(prev => 
      prev.map(user => ({
        ...user,
        isTeamLead: user.id === userId
      }))
    );
  };
  
  // Funktion zum Validieren des Formulars
  const validateForm = (): boolean => {
    const errors = {
      title: !formData.title.trim(),
      customer: !formData.customer.trim(),
      project: !formData.project.trim(),
    };
    
    setFormErrors(errors);
    
    // Prüfe auch, ob für Admin/Manager Mitarbeiter zugewiesen sind
    if ((userRole === "admin" || userRole === "manager") && assignedUsers.length === 0) {
      toast({
        title: "Mitarbeiter erforderlich",
        description: "Bitte weisen Sie mindestens einen Mitarbeiter zu.",
        variant: "destructive",
      });
      return false;
    }
    
    // Prüfe, ob ein Teamleiter festgelegt wurde
    if ((userRole === "admin" || userRole === "manager") && assignedUsers.length > 0 && !teamLeadId) {
      toast({
        title: "Teamleiter erforderlich",
        description: "Bitte legen Sie einen Teamleiter fest.",
        variant: "destructive",
      });
      return false;
    }
    
    return !Object.values(errors).some(error => error);
  };
  
  // Funktion zum Speichern des Auftrags
  const handleSave = () => {
    // Form-Validierung
    if (!validateForm()) {
      return;
    }
    
    // Kombiniere Datum und Zeit
    const combineDateAndTime = (date: Date | null, timeString: string | undefined): Date | null => {
      if (!date) return null;
      
      try {
        const newDate = new Date(date);
        if (timeString) {
          const [hours, minutes] = timeString.split(':').map(Number);
          newDate.setHours(hours, minutes);
        }
        return newDate;
      } catch (error) {
        console.error('Fehler bei der Datumskonvertierung:', error);
        return date;
      }
    };
    
    // Startdatum mit Uhrzeit kombinieren
    if (formData.startDate) {
      formData.startDate = combineDateAndTime(formData.startDate, formData.startTime);
    }
    
    // Enddatum mit Uhrzeit kombinieren
    if (formData.endDate) {
      formData.endDate = combineDateAndTime(formData.endDate, formData.endTime);
    }
    
    // Bestätigungsfrist mit Uhrzeit kombinieren
    if (formData.confirmationDeadline) {
      formData.confirmationDeadline = combineDateAndTime(
        formData.confirmationDeadline, 
        formData.confirmationTime
      );
    }
    
    // Debug-Log für die gesetzten Daten
    console.log("🔍 Kunden- und Projektinformationen:", {
      customer: formData.customer,
      customerId: formData.customerId,
      project: formData.project,
      projectId: formData.projectId,
      customerDetails: customerDetails,
      projectDetails: projectDetails
    });
    
    // Finalisiere Daten für die Übergabe
    const submissionData = finalizeOrderData();
    
    // Debug-Log für die finalisierten Daten
    console.log("✅ Finalisierte Daten:", submissionData);
    
    if (onSubmit) {
      onSubmit(submissionData);
    }
    
    onClose();
  };
  
  // Handler für die Auswahl eines Kunden
  const handleCustomerChange = (customerId: string) => {
    console.log("Customer ID geändert:", customerId);
    
    // Setze customerId im Formular
    setFormData(prev => ({ ...prev, customerId }));
    
    // Selektiere den Kunden aus den verfügbaren Kunden
    const selectedCustomer = availableCustomers.find(c => c.id === customerId);
    
    if (selectedCustomer) {
      // Kundendaten im Formular setzen
      setFormData(prev => ({ 
        ...prev, 
        customerId, 
        customer: selectedCustomer.name
      }));
      
      // Lade ausführliche Kundendaten aus der Datenbank
      const loadCustomerDetails = async () => {
        try {
          const CustomerService = (await import('@/lib/services/customerService')).CustomerService;
          const customerDetails = await CustomerService.getCustomerById(customerId);
          
          if (customerDetails) {
            console.log("✅ Ausführliche Kundendaten geladen:", customerDetails);
            // Wir speichern diese Informationen, damit sie später beim Speichern verfügbar sind
            setCustomerDetails(customerDetails);
          }
        } catch (error) {
          console.error("Fehler beim Laden der Kundendetails:", error);
        }
      };
      
      loadCustomerDetails();
    }
    
    // Filter verfügbare Projekte basierend auf ausgewähltem Kunden
    const filteredProjects = availableProjects.filter(
      (p) => p.customerId === customerId
    );
    
    setFilteredProjects(filteredProjects);
    
    // Projekt zurücksetzen, wenn der Kunde geändert wird
    setFormData(prev => ({ ...prev, project: "", projectId: "" }));
  };
  
  // Handler für die Auswahl eines Projekts
  const handleProjectChange = (projectId: string) => {
    // Aktualisiere das Formular
    const selectedProject = availableProjects.find((project) => project.id === projectId);
    
    if (selectedProject) {
      setFormData({
        ...formData,
        project: selectedProject.name,
        projectId: selectedProject.id,
      });
      
      // Lade detaillierte Projektinformationen
      const loadProjectDetails = async () => {
        try {
          const projectData = await ProjectService.getProjectById(projectId);
          console.log("Projektdaten geladen:", projectData);
          
          // Projektdetails setzen
          setProjectDetails({
            description: projectData.description || "",
            status: projectData.status || "",
            budget: projectData.budget,
            startDate: projectData.startDate,
            endDate: projectData.endDate,
            // Standortdaten hinzufügen
            address: projectData.address || "",
            latitude: projectData.latitude,
            longitude: projectData.longitude
          });
        } catch (error) {
          console.error("Fehler beim Laden der Projektdetails:", error);
        }
      };
      
      loadProjectDetails();
    }
  };

  // Handler für das Aktualisieren der Testdaten
  const handleUpdateTestData = (newData: any) => {
    console.log('🧪 Testdaten aktualisiert:', newData);
    setTestData(newData);
    
    // Funktion aufrufen, um die Testdaten im Hook zu aktualisieren
    if (typeof window !== 'undefined') {
      // Speichere die Testdaten im localStorage, damit sie wiederverwendet werden können
      localStorage.setItem('timetracker_test_data', JSON.stringify(newData));
      
      toast({
        title: "Testdaten aktualisiert",
        description: "Die Änderungen an den Testdaten wurden gespeichert.",
        variant: "default",
      });
    }
  };
  
  // Handler für das Aktualisieren der AI-Einstellungen
  const handleUpdateAISettings = (newSettings: any) => {
    console.log('🧠 AI-Einstellungen aktualisiert:', newSettings);
    setAiSettings(newSettings);
    
    // Speichere die AI-Einstellungen im localStorage, damit sie wiederverwendet werden können
    if (typeof window !== 'undefined') {
      localStorage.setItem('timetracker_ai_settings', JSON.stringify(newSettings));
      
      toast({
        title: "AI-Einstellungen aktualisiert",
        description: "Die Änderungen an den AI-Einstellungen wurden gespeichert.",
        variant: "default",
      });
    }
  };
  
  // Testdaten aus localStorage laden, wenn vorhanden
  useEffect(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      try {
        const savedTestData = localStorage.getItem('timetracker_test_data');
        if (savedTestData) {
          const parsedData = JSON.parse(savedTestData);
          setTestData(parsedData);
          console.log('🧪 Gespeicherte Testdaten geladen');
        }
      } catch (error) {
        console.error('Fehler beim Laden der Testdaten:', error);
      }
    }
  }, []);
  
  // AI-Einstellungen aus localStorage laden, wenn vorhanden
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedAISettings = localStorage.getItem('timetracker_ai_settings');
        if (savedAISettings) {
          const parsedSettings = JSON.parse(savedAISettings);
          setAiSettings(parsedSettings);
          console.log('🧠 Gespeicherte AI-Einstellungen geladen');
          
          // Wenn AI aktiviert war, setze useAIAssistant auf true
          if (parsedSettings.enabled) {
            setUseAIAssistant(true);
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden der AI-Einstellungen:', error);
      }
    }
  }, []);

  const finalizeOrderData = () => {
    const finalOrder: any = {
      title: formData.title,
      client: formData.customer,
      customerId: formData.customerId,
      project: formData.project,
      projectId: formData.projectId,
      description: formData.description,
      status: formData.status || "pending",
      priority: formData.priority || "Mittel",
      category: formData.category || "",
      estimatedTime: formData.estimatedTime,
      notes: formData.notes,
      
      // Zusätzliche Details vom Kunden
      customerDetails: customerDetails ? {
        address: customerDetails.address,
        contactPersons: customerDetails.contactPersons,
        email: customerDetails.email,
        phone: customerDetails.phone,
        website: customerDetails.website
      } : undefined,
      
      // Zusätzliche Details vom Projekt, mit Standortdaten
      projectDetails: projectDetails ? {
        description: projectDetails.description,
        status: projectDetails.status,
        budget: projectDetails.budget,
        startDate: projectDetails.startDate,
        endDate: projectDetails.endDate,
        // Standortdaten hinzufügen
        address: projectDetails.address,
        latitude: projectDetails.latitude,
        longitude: projectDetails.longitude
      } : undefined,
      
      // Rest wie gehabt
      date: new Date(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      confirmationDeadline: formData.confirmationDeadline,
    };

    // Nur hinzufügen, wenn Benutzer zugewiesen wurden
    if (assignedUsers.length > 0) {
      finalOrder.assignedUsers = assignedUsers;
      finalOrder.assignedTo = assignedUsers.map(u => u.id);

      // Wenn ein Teamleiter ausgewählt wurde, diesen setzen
      if (teamLeadId) {
        finalOrder.teamLeadId = teamLeadId;
      }
    }

    return finalOrder;
  };

  // Füge die Felder für Stunden und Minuten hinzu
  const [estimatedHours, setEstimatedHours] = useState<number>(0);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(0);

  // Initialisiere die Felder, wenn ein Auftrag geladen wird
  useEffect(() => {
    if (order) {
      // Bestehende Formularwerte setzen (bleibt wie bisher)
      const initialFormValues = {
        ...order,
        assignedTo: order.assignedTo || [],
        date: order.date instanceof Date ? order.date : (order.date instanceof Timestamp ? order.date.toDate() : new Date(order.date)),
        startDate: order.startDate ? (order.startDate instanceof Date ? order.startDate : (order.startDate instanceof Timestamp ? order.startDate.toDate() : new Date(order.startDate))) : new Date(),
        endDate: order.endDate ? (order.endDate instanceof Date ? order.endDate : (order.endDate instanceof Timestamp ? order.endDate.toDate() : new Date(order.endDate))) : new Date(),
        confirmationDeadline: order.confirmationDeadline ? (order.confirmationDeadline instanceof Date ? order.confirmationDeadline : (order.confirmationDeadline instanceof Timestamp ? order.confirmationDeadline.toDate() : new Date(order.confirmationDeadline))) : new Date(),
        assignee: Array.isArray(order.assignedTo) ? order.assignedTo : (typeof order.assignedTo === "string" ? [order.assignedTo] : []),
        category: order.category || "",
        notes: "",
        estimatedTime: order.estimatedTime || 0,
        customer: order.client || "",
        project: order.project || "",
        priority: order.priority || "Mittel" // Standardwert für priority
      };
      
      setFormData(initialFormValues);
      
      // Initialisiere die geschätzte Zeit
      if (order.estimatedTime) {
        setEstimatedHours(Math.floor(order.estimatedTime / 60));
        setEstimatedMinutes(order.estimatedTime % 60);
      }
    }
  }, [order]);

  // Aktualisiere estimatedTime, wenn sich Stunden oder Minuten ändern
  useEffect(() => {
    const totalMinutes = (estimatedHours * 60) + estimatedMinutes;
    setFormData(prev => ({
      ...prev,
      estimatedTime: totalMinutes
    }));
  }, [estimatedHours, estimatedMinutes]);

  const [availableEmployeesList, setAvailableEmployeesList] = useState<Array<{ id: string; name: string; role?: string; skills?: string[] }>>([]);
  const [customerDetails, setCustomerDetails] = useState<any>(null);
  const [projectDetails, setProjectDetails] = useState<any>(null);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {order ? "Auftrag bearbeiten" : "Neuen Auftrag erstellen"}
            
            {/* Animiertes AI-Assistenten-Badge */}
            {useAIAssistant && (
              <div className="relative flex items-center ml-3">
                <span className="absolute -inset-1 rounded-full bg-primary/10 blur-sm animate-pulse"></span>
                <Badge 
                  variant="outline" 
                  className="relative flex items-center gap-1.5 px-2 py-0.5 bg-background border-primary text-primary"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-xs">KI-Assistent</span>
                </Badge>
                <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/50 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                </span>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col space-y-4 mt-4">
          {/* Hier werden die Formularfelder eingefügt, beginnend mit dem Titel */}
          <div className="grid w-full gap-1.5">
            <Label htmlFor="title">Titel</Label>
            <Input 
              id="title" 
              value={formData.title} 
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Titel des Auftrags"
              required
              className={formErrors.title ? "border-red-500" : ""}
            />
            {formErrors.title && <p className="text-sm text-red-500">Bitte geben Sie einen Titel ein.</p>}

            {/* KI-Button nur anzeigen, wenn Kunde und Projekt ausgewählt wurden */}
            {hasAiAccess && showAiButton && (
              <Button
                type="button"
                variant="outline"
                className="mt-2 gap-2"
                onClick={() => {
                  // Prüfen, ob Titel, Kunde und Projekt ausgewählt sind
                  if (!formData.title || !formData.customerId || !formData.projectId) {
                    toast({
                      title: "Fehlende Daten",
                      description: "Bitte füllen Sie Titel, Kunde und Projekt aus, um KI-Vorschläge zu erhalten.",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Nur Mitarbeiter mit der Rolle "employee" oder "mitarbeiter" filtern
                  const filteredEmployees = availableEmployees.filter(emp => 
                    emp.role?.toLowerCase() === 'employee' || 
                    emp.role?.toLowerCase() === 'mitarbeiter' ||
                    !emp.role
                  );
                  
                  // Debugging im Event-Handler
                  console.log("KI-Anfrage mit Mitarbeitern:", {
                    mitarbeiter: filteredEmployees,
                    kunde: formData.customer,
                    projekt: formData.project,
                    kategorie: formData.category
                  });
                  generateAiSuggestions();
                }}
                disabled={aiLoading || !formData.title || !formData.customerId || !formData.projectId}
              >
                <Brain className="h-4 w-4" />
                {aiLoading ? "KI denkt nach..." : "KI-Vorschläge generieren"}
              </Button>
            )}
          </div>
          
          {/* KI-Vorschläge Anzeige - verbessert und prominenter */}
          {showSuggestions && aiSuggestions && (
            <Card className="border-primary/50 bg-primary/5 mt-4">
              <CardContent className="pt-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-medium">KI-Vorschläge</h3>
                  </div>
                  <div className="flex items-center">
                    <Checkbox 
                      id="apply-suggestions" 
                      checked={applySuggestions}
                      onCheckedChange={(checked) => setApplySuggestions(!!checked)}
                    />
                    <label 
                      htmlFor="apply-suggestions" 
                      className="ml-2 text-sm font-medium cursor-pointer"
                    >
                      Alle übernehmen
                    </label>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div className="flex items-center justify-between gap-2 bg-background p-2 rounded-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Kunde</p>
                      <p className="text-sm font-medium">{aiSuggestions.kunde}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        const matchedCustomer = availableCustomers.find(
                          customer => customer.name.toLowerCase() === aiSuggestions.kunde.toLowerCase()
                        );
                        
                        setFormData(prev => ({
                          ...prev,
                          customer: matchedCustomer?.name || aiSuggestions.kunde,
                          customerId: matchedCustomer?.id || "",
                        }));
                      }}
                      className="h-7 px-2"
                    >
                      Übernehmen
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2 bg-background p-2 rounded-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Projekt</p>
                      <p className="text-sm font-medium">{aiSuggestions.projekt}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        const matchedProject = availableProjects.find(
                          project => project.name.toLowerCase() === aiSuggestions.projekt.toLowerCase()
                        );
                        
                        setFormData(prev => ({
                          ...prev,
                          project: matchedProject?.name || aiSuggestions.projekt,
                          projectId: matchedProject?.id || "",
                        }));
                      }}
                      className="h-7 px-2"
                    >
                      Übernehmen
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2 bg-background p-2 rounded-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Kategorie</p>
                      <p className="text-sm font-medium">{aiSuggestions.kategorie}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          category: aiSuggestions.kategorie,
                        }));
                      }}
                      className="h-7 px-2"
                    >
                      Übernehmen
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2 bg-background p-2 rounded-md">
                    <div>
                      <p className="text-xs text-muted-foreground">Priorität</p>
                      <p className="text-sm font-medium">{aiSuggestions.prioritaet}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          priority: mapPriorityToFormValue(aiSuggestions.prioritaet),
                        }));
                      }}
                      className="h-7 px-2"
                    >
                      Übernehmen
                    </Button>
                  </div>
                </div>
                
                {/* Neue Sektion für Mitarbeitervorschläge */}
                {aiSuggestions.passendeMitarbeiter && aiSuggestions.passendeMitarbeiter.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 border-t border-primary/20 pt-3 mb-2">
                      <User className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-medium">Passende Mitarbeiter</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {aiSuggestions.passendeMitarbeiter.map((mitarbeiter, index) => (
                        <div key={mitarbeiter.id || index} className="bg-background p-3 rounded-md">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center">
                                <p className="font-medium">{mitarbeiter.name}</p>
                                {mitarbeiter.teamLeadEmpfehlung && (
                                  <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-200">Teamleiter</Badge>
                                )}
                              </div>
                              
                              {/* Fähigkeiten anzeigen, falls vorhanden */}
                              {Array.isArray(mitarbeiter.skills) && mitarbeiter.skills.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {mitarbeiter.skills.map((skill: string, skillIndex: number) => (
                                    <Badge key={skillIndex} variant="outline" className="text-xs">{skill}</Badge>
                                  ))}
                                </div>
                              )}
                              
                              {/* Passende Beschreibung anzeigen, falls vorhanden */}
                              {typeof mitarbeiter.passt === 'string' && mitarbeiter.passt && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  <span className="font-semibold">Begründung: </span>
                                  {mitarbeiter.passt}
                                </p>
                              )}
                            </div>
                            
                            <Button 
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Prüfe, ob der Mitarbeiter bereits zugewiesen ist
                                const isAlreadyAssigned = assignedUsers.some(u => 
                                  u.name.toLowerCase() === mitarbeiter.name.toLowerCase() || 
                                  u.id === mitarbeiter.id
                                );
                                
                                if (!isAlreadyAssigned) {
                                  // Suche den Mitarbeiter in der verfügbaren Liste
                                  const matchedEmployee = availableEmployees.find(emp => 
                                    emp.name.toLowerCase() === mitarbeiter.name.toLowerCase() || 
                                    emp.id === mitarbeiter.id
                                  );
                                  
                                  if (matchedEmployee) {
                                    // Füge den Mitarbeiter zu den zugewiesenen Benutzern hinzu
                                    const newUser = { 
                                      id: matchedEmployee.id, 
                                      name: matchedEmployee.name,
                                      status: "pending",
                                      isTeamLead: mitarbeiter.teamLeadEmpfehlung || false,
                                      notify: true // Standardmäßig E-Mail-Benachrichtigungen aktivieren
                                    };
                                    
                                    setAssignedUsers(prev => [...prev, newUser]);
                                    
                                    // Wenn als Teamleiter empfohlen und kein Teamleiter gesetzt ist
                                    if (mitarbeiter.teamLeadEmpfehlung && !teamLeadId) {
                                      setTeamLeadId(matchedEmployee.id);
                                    }
                                    
                                    toast({
                                      title: "Mitarbeiter zugewiesen",
                                      description: `${matchedEmployee.name} wurde dem Auftrag zugewiesen.`
                                    });
                                  }
                                } else {
                                  toast({
                                    title: "Mitarbeiter bereits zugewiesen",
                                    description: `${mitarbeiter.name} ist bereits diesem Auftrag zugewiesen.`
                                  });
                                }
                              }}
                              className="flex items-center gap-1"
                            >
                              <User className="h-3 w-3" />
                              Zuweisen
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Kunden- und Projektinformationen anzeigen, falls vorhanden */}
                    {aiSuggestions.kundenDetails && (
                      <div className="mt-4 border-t border-primary/20 pt-3">
                        <h4 className="text-sm font-medium mb-2">Kundeninformationen</h4>
                        <div className="bg-muted/30 p-2 rounded-md text-xs">
                          <p><span className="font-semibold">Branche:</span> {aiSuggestions.kundenDetails.industry || 'Nicht angegeben'}</p>
                          {aiSuggestions.kundenDetails.contactPerson && (
                            <p><span className="font-semibold">Kontakt:</span> {aiSuggestions.kundenDetails.contactPerson}</p>
                          )}
                          {aiSuggestions.kundenDetails.notes && (
                            <p><span className="font-semibold">Notizen:</span> {aiSuggestions.kundenDetails.notes}</p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {aiSuggestions.projektDetails && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-2">Projektinformationen</h4>
                        <div className="bg-muted/30 p-2 rounded-md text-xs">
                          <p><span className="font-semibold">Status:</span> {aiSuggestions.projektDetails.status || 'Nicht angegeben'}</p>
                          {aiSuggestions.projektDetails.type && (
                            <p><span className="font-semibold">Typ:</span> {aiSuggestions.projektDetails.type}</p>
                          )}
                          {aiSuggestions.projektDetails.description && (
                            <p><span className="font-semibold">Beschreibung:</span> {aiSuggestions.projektDetails.description}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Formularfelder */}
          <div className="space-y-4">
          {/* Beschreibung */}
          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea 
              id="description" 
              value={formData.description} 
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Beschreibung des Auftrags" 
              rows={4}
            />
          </div>
          
          {/* Start- und Enddatum mit Uhrzeit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Startdatum */}
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum</Label>
              <div className="grid grid-cols-2 gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.startDate ? format(formData.startDate, "PPP", { locale: de }) : "Start auswählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.startDate || undefined}
                      onSelect={(date) => setFormData({ ...formData, startDate: date || null })}
                      initialFocus
                      locale={de}
                    />
                  </PopoverContent>
                </Popover>
                <Input 
                  type="time"
                  placeholder="Startzeit"
                  value={formData.startTime || ""}
                  onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                  className="w-full"
                />
              </div>
            </div>
            
            {/* Enddatum */}
            <div className="space-y-2">
              <Label htmlFor="endDate">Enddatum</Label>
              <div className="grid grid-cols-2 gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.endDate ? format(formData.endDate, "PPP", { locale: de }) : "Ende auswählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.endDate || undefined}
                      onSelect={(date) => setFormData({ ...formData, endDate: date || null })}
                      initialFocus
                      locale={de}
                    />
                  </PopoverContent>
                </Popover>
                <Input 
                  type="time"
                  placeholder="Endzeit"
                  value={formData.endTime || ""}
                  onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          
          {/* Bestätigungsfrist */}
          <div className="space-y-2">
            <Label htmlFor="confirmationDeadline">Bestätigungsfrist</Label>
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.confirmationDeadline && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.confirmationDeadline ? format(formData.confirmationDeadline, "PPP", { locale: de }) : "Frist auswählen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.confirmationDeadline || undefined}
                    onSelect={(date) => setFormData({ ...formData, confirmationDeadline: date || null })}
                    initialFocus
                    locale={de}
                  />
                </PopoverContent>
              </Popover>
              <Input 
                type="time"
                placeholder="Uhrzeit"
                value={formData.confirmationTime || ""}
                onChange={(e) => setFormData({...formData, confirmationTime: e.target.value})}
                className="w-full"
              />
            </div>
          </div>
          
            {/* Kundenzuweisung und Projektwahl */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kundenzuweisung */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-2">
                    Kunde {formData.customerId && <Badge variant="outline" className="bg-blue-50 text-blue-700">Ausgewählt</Badge>}
                  </Label>
                  <div className="relative">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            formData.customer ? "border-blue-300 bg-blue-50" : "border-input",
                            formErrors.customer ? "border-red-500" : ""
                          )}
                        >
                          {formData.customer || "Kunde auswählen"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput placeholder="Kunden suchen..." />
                          <CommandList>
                            <CommandEmpty>Kein Kunde gefunden.</CommandEmpty>
                            <CommandGroup>
                              {availableCustomers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.id}
                                  onSelect={() => {
                                    setFormData({
                                      ...formData,
                                      customer: customer.name,
                                      customerId: customer.id,
                                    });
                                    setFormErrors({
                                      ...formErrors,
                                      customer: false,
                                    });
                                  }}
                                  className={customer.id === formData.customerId ? "bg-blue-50" : ""}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.customerId === customer.id
                                        ? "opacity-100 text-blue-600"
                                        : "opacity-0"
                                    )}
                                  />
                                  {customer.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {formErrors.customer && (
                      <p className="text-sm text-red-500 mt-1">Bitte wählen Sie einen Kunden aus.</p>
                    )}
                    {/* Visuelles Feedback für die Kundenauswahl */}
                    {formData.customerId && (
                      <div className="mt-2 p-2 bg-blue-50 rounded-md border border-blue-100">
                        <p className="text-xs text-blue-700">
                          <span className="font-semibold">Ausgewählter Kunde:</span> {formData.customer}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Projektzuweisung */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-2">
                    Projekt {formData.projectId && <Badge variant="outline" className="bg-green-50 text-green-700">Ausgewählt</Badge>}
                  </Label>
                  <div className="relative">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            formData.project ? "border-green-300 bg-green-50" : "border-input",
                            formErrors.project ? "border-red-500" : ""
                          )}
                          disabled={!formData.customerId}
                        >
                          {formData.project || (formData.customerId ? "Projekt auswählen" : "Zuerst Kunde auswählen")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput placeholder="Projekt suchen..." />
                          <CommandList>
                            <CommandEmpty>
                              {!formData.customerId 
                                ? "Bitte wählen Sie zuerst einen Kunden aus." 
                                : "Kein Projekt für diesen Kunden gefunden."}
                            </CommandEmpty>
                            <CommandGroup>
                              {filteredProjects.map((project) => (
                                <CommandItem
                                  key={project.id}
                                  value={project.id}
                                  onSelect={() => {
                                    setFormData({
                                      ...formData,
                                      project: project.name,
                                      projectId: project.id,
                                    });
                                    setFormErrors({
                                      ...formErrors,
                                      project: false,
                                    });
                                  }}
                                  className={project.id === formData.projectId ? "bg-green-50" : ""}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.projectId === project.id
                                        ? "opacity-100 text-green-600"
                                        : "opacity-0"
                                    )}
                                  />
                                  {project.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {formErrors.project && (
                      <p className="text-sm text-red-500 mt-1">Bitte wählen Sie ein Projekt aus.</p>
                    )}
                    {/* Visuelles Feedback für die Projektauswahl */}
                    {formData.projectId && (
                      <div className="mt-2 p-2 bg-green-50 rounded-md border border-green-100">
                        <p className="text-xs text-green-700">
                          <span className="font-semibold">Ausgewähltes Projekt:</span> {formData.project}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          
            {/* Geschätzte Zeit Eingabefeld (für Dialog) */}
            <div className="space-y-2">
              <Label htmlFor="estimatedTime">Geschätzte Zeit</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="flex items-center">
                    <Input
                      id="estimatedHours"
                      type="number"
                      min="0"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(parseInt(e.target.value) || 0)}
                      className="mr-2"
                    />
                    <Label htmlFor="estimatedHours" className="whitespace-nowrap">Stunden</Label>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center">
                    <Input
                      id="estimatedMinutes"
                      type="number"
                      min="0"
                      max="59"
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 0)}
                      className="mr-2"
                    />
                    <Label htmlFor="estimatedMinutes" className="whitespace-nowrap">Minuten</Label>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Diese Zeit wird als Vorgabe für die Zeiterfassung verwendet.
              </p>
            </div>
          
            {/* KI-Einstellungen nur anzeigen, wenn KI aktiviert ist */}
            {hasAiAccess && (
              <div className="flex items-center justify-center mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowAIDialog(true)}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  KI-Einstellungen
                </Button>
              </div>
            )}
          
            {/* Kategorie */}
            <div className="space-y-2">
              <Label htmlFor="category">Kategorie</Label>
              <Input 
                id="category" 
                value={formData.category || ""} 
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                placeholder="z.B. Support, Entwicklung, Beratung..." 
              />
            </div>
          
            {/* Priorität */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priorität</Label>
              <RadioGroup
                value={formData.priority}
                onValueChange={(value) => setFormData({...formData, priority: value})}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Niedrig" id="low" />
                  <Label htmlFor="low">Niedrig</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Mittel" id="medium" />
                  <Label htmlFor="medium">Mittel</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Hoch" id="high" />
                  <Label htmlFor="high">Hoch</Label>
                </div>
              </RadioGroup>
            </div>
              
            {/* Mitarbeiterzuweisung - KI-Vorschläge nur bei aktivierter KI */}
            {(userRole === "admin" || userRole === "manager") && (
              <div className="space-y-2 border rounded-md p-4">
                <h3 className="font-medium text-sm mb-2">Mitarbeiterzuweisung</h3>
                
                {/* KI-Vorschläge nur anzeigen, wenn KI aktiviert ist */}
                {hasAiAccess && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">KI-Vorschläge</h4>
                    
                    <Button
                      variant="outline"
                      className="w-full flex items-center gap-2 mb-2"
                      onClick={() => {
                        // Prüfen, ob Kunde und Projekt ausgewählt sind
                        if (!formData.customerId || !formData.projectId) {
                          toast({
                            title: "Fehlende Angaben",
                            description: "Bitte wählen Sie erst Kunde und Projekt aus.",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        // Nur Mitarbeiter mit der Rolle "employee" oder "mitarbeiter" filtern
                        const filteredEmployees = availableEmployees.filter(emp => 
                          emp.role?.toLowerCase() === 'employee' || 
                          emp.role?.toLowerCase() === 'mitarbeiter' ||
                          !emp.role
                        );
                        
                        // Debugging im Event-Handler
                        console.log("KI-Anfrage mit Mitarbeitern:", {
                          mitarbeiter: filteredEmployees,
                          kunde: formData.customer,
                          projekt: formData.project,
                          kategorie: formData.category
                        });
                        generateAiSuggestions();
                      }}
                      disabled={!formData.customerId || !formData.projectId || aiLoading}
                    >
                      <Brain className="h-4 w-4" />
                      Mitarbeitervorschläge generieren
                    </Button>
                    
                    <EmployeeSuggestions 
                      onAssignEmployee={(employee) => {
                        const newUser = { 
                          id: employee.id, 
                          name: employee.name,
                          status: "pending",
                          isTeamLead: Boolean(employee.teamLeadEmpfehlung) 
                        };
                        
                        if (!assignedUsers.some(u => u.id === employee.id)) {
                          setAssignedUsers(prev => [...prev, newUser]);
                          
                          if (employee.teamLeadEmpfehlung && !teamLeadId) {
                            setTeamLeadId(employee.id);
                          }
                        }
                      }}
                      onSetTeamLead={setTeamLead}
                      alreadyAssigned={assignedUsers.map(user => user.id)}
                      kundeId={formData.customerId}
                      kundeName={formData.customer}
                      projektId={formData.projectId}
                      projektName={formData.project}
                      kategorie={formData.category}
                      beschreibung={formData.description}
                      useDevelopmentMode={useDevelopmentMode}
                      availableEmployees={availableEmployees}
                    />
                  </div>
                )}
                
                {/* Bereits zugewiesene Mitarbeiter */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Zugewiesene Mitarbeiter</h4>
                  {assignedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine Mitarbeiter zugewiesen</p>
                  ) : (
                    <div className="space-y-2">
                      {assignedUsers.map(user => (
                        <div 
                          key={user.id} 
                          className="flex justify-between items-center p-2 border rounded-md"
                        >
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>{user.name}</span>
                            {user.isTeamLead && (
                              <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-200">
                                Teamleiter
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!user.isTeamLead && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setTeamLead(user.id)}
                              >
                                Als Teamleiter
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (user.isTeamLead) {
                                  setTeamLeadId(null);
                                }
                                setAssignedUsers(prev => prev.filter(u => u.id !== user.id));
                              }}
                            >
                              Entfernen
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Einfache Mitarbeiterauswahl für manuelle Zuweisung */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Verfügbare Mitarbeiter</h4>
                  <Input
                    placeholder="Mitarbeiter suchen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mb-2"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                    {filteredEmployees.map(employee => (
                      <div key={employee.id} className="flex items-center p-2 border rounded-md cursor-pointer hover:bg-primary/5">
                        <Checkbox 
                          checked={assignedUsers.some(u => u.id === employee.id)}
                          onCheckedChange={() => toggleAssignedUser(employee.id, employee.name)}
                          className="mr-2"
                        />
                        <div className="flex flex-col">
                          <span>{employee.name}</span>
                          {employee.role && (
                            <span className="text-xs text-muted-foreground">
                              {employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Zusätzliche Einstellungen für Benachrichtigungen */}
                <div className="mt-4 border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Benachrichtigungseinstellungen</h4>
                  
                  {assignedUsers.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-2">Aktivieren oder deaktivieren Sie E-Mail-Benachrichtigungen für die einzelnen Mitarbeiter:</p>
                      
                      {assignedUsers.map(user => (
                        <div key={user.id} className="flex items-center justify-between p-2 border rounded-md">
                          <span>{user.name}</span>
                          <div className="flex items-center">
                            <Checkbox 
                              id={`notify-${user.id}`}
                              checked={user.notify !== false} // Default ist true, wenn nicht explizit auf false gesetzt
                              onCheckedChange={(checked) => {
                                setAssignedUsers(prev => 
                                  prev.map(u => 
                                    u.id === user.id ? { ...u, notify: !!checked } : u
                                  )
                                );
                              }}
                              className="mr-2"
                            />
                            <Label htmlFor={`notify-${user.id}`} className="text-xs">
                              E-Mail-Benachrichtigung
                            </Label>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Fügen Sie zuerst Mitarbeiter hinzu, um Benachrichtigungseinstellungen anzupassen.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" onClick={handleSave}>Speichern</Button>
        </DialogFooter>

        {/* Test-Dialoge nur im Development-Modus anzeigen */}
        {import.meta.env.DEV && (
          <>
            <TestDataDialog
              open={showTestDataDialog}
              onOpenChange={setShowTestDataDialog}
              testData={testData}
              onUpdateTestData={handleUpdateTestData}
            />
            
            <AIAssistantDialog
              open={showAIDialog}
              onOpenChange={setShowAIDialog}
              aiSettings={aiSettings}
              onUpdateSettings={handleUpdateAISettings}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderDialog; 