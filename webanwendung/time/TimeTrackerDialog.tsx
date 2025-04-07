import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";
import TimeTracker from "./TimeTracker";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimeTrackerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

const TimeTrackerDialog: React.FC<TimeTrackerDialogProps> = ({
  open,
  onOpenChange,
  className = ""
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`sm:max-w-[600px] max-h-[90vh] overflow-auto ${className}`}
      >
        <DialogHeader className="flex items-center justify-between flex-row">
          <DialogTitle>Zeiterfassung</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon">
              <X className="h-4 w-4" />
              <span className="sr-only">Schließen</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        
        <TimeTracker 
          expanded={true}
          className="w-full"
        />
      </DialogContent>
    </Dialog>
  );
};

export default TimeTrackerDialog; 