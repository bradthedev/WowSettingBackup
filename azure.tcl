# Modern Azure Theme for tkinter
# Based on Azure theme by rdbende
# Simplified version for our application

package require Tk 8.6

namespace eval ttk::theme::azure {
    variable version 2.1
    variable dir [file dirname [info script]]

    # Create theme
    ttk::style theme create azure -parent clam -settings {
        
        # Configure colors
        ttk::style configure . \
            -background "#ffffff" \
            -foreground "#323130" \
            -bordercolor "#e1dfdd" \
            -darkcolor "#c8c6c4" \
            -lightcolor "#f3f2f1" \
            -focuscolor "#0078d4" \
            -selectbackground "#0078d4" \
            -selectforeground "#ffffff" \
            -insertcolor "#323130" \
            -troughcolor "#f3f2f1" \
            -fieldbackground "#ffffff" \
            -font {"Segoe UI" 9}

        # Button styling
        ttk::style configure TButton \
            -background "#f3f2f1" \
            -foreground "#323130" \
            -borderwidth 1 \
            -focuscolor none \
            -padding {10 5}

        ttk::style map TButton \
            -background [list \
                active "#e1dfdd" \
                pressed "#d2d0ce" \
                disabled "#f3f2f1"] \
            -foreground [list \
                disabled "#a19f9d"]

        # Entry styling
        ttk::style configure TEntry \
            -background "#ffffff" \
            -foreground "#323130" \
            -borderwidth 1 \
            -insertcolor "#323130" \
            -fieldbackground "#ffffff"

        # Frame styling
        ttk::style configure TFrame \
            -background "#ffffff" \
            -borderwidth 0

        ttk::style configure TLabelFrame \
            -background "#ffffff" \
            -borderwidth 1 \
            -relief solid

        ttk::style configure TLabelFrame.Label \
            -background "#ffffff" \
            -foreground "#323130" \
            -font {"Segoe UI" 10 bold}

        # Label styling
        ttk::style configure TLabel \
            -background "#ffffff" \
            -foreground "#323130" \
            -font {"Segoe UI" 9}

        # Progressbar styling
        ttk::style configure TProgressbar \
            -background "#0078d4" \
            -troughcolor "#f3f2f1" \
            -borderwidth 0 \
            -lightcolor "#0078d4" \
            -darkcolor "#005a9e"

        # Checkbutton styling
        ttk::style configure TCheckbutton \
            -background "#ffffff" \
            -foreground "#323130" \
            -focuscolor none \
            -font {"Segoe UI" 9}

        ttk::style map TCheckbutton \
            -background [list \
                active "#ffffff" \
                pressed "#ffffff"]

        # Combobox styling
        ttk::style configure TCombobox \
            -background "#ffffff" \
            -foreground "#323130" \
            -fieldbackground "#ffffff" \
            -borderwidth 1 \
            -arrowcolor "#323130"

        # Spinbox styling
        ttk::style configure TSpinbox \
            -background "#ffffff" \
            -foreground "#323130" \
            -fieldbackground "#ffffff" \
            -borderwidth 1 \
            -arrowcolor "#323130"
    }
}
