(function () {
  "use strict";

  var data = window.__BRAND__ || {};
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fineHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function safe(fn, name) {
    try {
      fn();
    } catch (error) {
      console.warn("[Petsgates · " + name + "]", error);
    }
  }

  function initHeader() {
    var header = $("[data-header]");
    if (!header) return;
    var ticking = false;

    function update() {
      header.classList.toggle("is-scrolled", window.scrollY > 28);
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });

    update();
  }

  function initMobileMenu() {
    var toggle = $("[data-menu-toggle]");
    var menu = $("[data-mobile-menu]");
    if (!toggle || !menu || toggle.dataset.bound === "1") return;
    toggle.dataset.bound = "1";

    var lastFocused = null;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      menu.setAttribute("aria-hidden", String(!open));
      menu.inert = !open;
      document.body.classList.toggle("menu-open", open);

      if (open) {
        lastFocused = document.activeElement;
        window.setTimeout(function () {
          var firstLink = $("a", menu);
          if (firstLink) firstLink.focus();
        }, 280);
      } else if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", function (event) {
      if (event.target.closest("a[href]")) setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      var focusables = $$('a[href], button:not([disabled])', menu).concat([toggle]);
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 960 && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
      }
    });
  }

  function initSmoothAnchors() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;
      var id = link.getAttribute("href");
      if (!id || id === "#") return;
      var target = $(id);
      if (!target) return;

      event.preventDefault();
      var header = $("[data-header]");
      var offset = header ? header.offsetHeight + 12 : 80;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduced ? "auto" : "smooth"
      });

      if (history.pushState) history.pushState(null, "", id);
    });
  }

  function initScrollProgress() {
    var bar = $("[data-scroll-progress]");
    if (!bar) return;
    var frame = null;

    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var progress = max > 0 ? window.scrollY / max : 0;
      bar.style.transform = "scaleX(" + Math.min(1, Math.max(0, progress)) + ")";
      frame = null;
    }

    window.addEventListener("scroll", function () {
      if (!frame) frame = window.requestAnimationFrame(update);
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  function initReveals() {
    var elements = $$('[data-reveal]');
    if (!elements.length) return;

    if (!("IntersectionObserver" in window)) {
      elements.forEach(function (element) {
        element.classList.add("is-revealed");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.01,
      rootMargin: "0px 0px -2% 0px"
    });

    elements.forEach(function (element, index) {
      element.style.transitionDelay = Math.min(index % 3, 2) * 70 + "ms";
      observer.observe(element);
    });

    window.setTimeout(function () {
      $$('[data-reveal]:not(.is-revealed)').forEach(function (element) {
        if (element.getBoundingClientRect().top < window.innerHeight * 1.2) {
          element.classList.add("is-revealed");
        }
      });
    }, 6000);
  }

  function initMagneticButtons() {
    if (!fineHover) return;

    $$('[data-magnetic]').forEach(function (element) {
      if (element.dataset.magneticBound === "1") return;
      element.dataset.magneticBound = "1";

      var inner = document.createElement("span");
      inner.className = "magnetic-inner";
      while (element.firstChild) inner.appendChild(element.firstChild);
      element.appendChild(inner);

      var targetX = 0;
      var targetY = 0;
      var currentX = 0;
      var currentY = 0;
      var frame = null;

      function animate() {
        currentX += (targetX - currentX) * 0.18;
        currentY += (targetY - currentY) * 0.18;
        inner.style.transform = "translate3d(" + currentX.toFixed(2) + "px," + currentY.toFixed(2) + "px,0)";

        if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
          frame = window.requestAnimationFrame(animate);
        } else {
          frame = null;
        }
      }

      function requestFrame() {
        if (!frame) frame = window.requestAnimationFrame(animate);
      }

      element.addEventListener("pointermove", function (event) {
        var rect = element.getBoundingClientRect();
        targetX = (event.clientX - rect.left - rect.width / 2) * 0.18;
        targetY = (event.clientY - rect.top - rect.height / 2) * 0.18;
        requestFrame();
      });

      element.addEventListener("pointerout", function (event) {
        if (element.contains(event.relatedTarget)) return;
        targetX = 0;
        targetY = 0;
        requestFrame();
      });
    });
  }

  function initTiltCards() {
    if (!fineHover) return;

    $$('[data-tilt-card]').forEach(function (card) {
      if (card.dataset.tiltBound === "1") return;
      card.dataset.tiltBound = "1";

      var targetX = 0;
      var targetY = 0;
      var currentX = 0;
      var currentY = 0;
      var frame = null;
      var max = card.classList.contains("photo-stage") ? 4 : 3.5;

      function animate() {
        currentX += (targetX - currentX) * 0.14;
        currentY += (targetY - currentY) * 0.14;
        card.style.setProperty("--rx", currentX.toFixed(2) + "deg");
        card.style.setProperty("--ry", currentY.toFixed(2) + "deg");

        if (Math.abs(targetX - currentX) > 0.04 || Math.abs(targetY - currentY) > 0.04) {
          frame = window.requestAnimationFrame(animate);
        } else {
          frame = null;
        }
      }

      function requestFrame() {
        if (!frame) frame = window.requestAnimationFrame(animate);
      }

      card.addEventListener("pointermove", function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - 0.5;
        var y = (event.clientY - rect.top) / rect.height - 0.5;
        targetX = -y * max;
        targetY = x * max;
        requestFrame();
      });

      card.addEventListener("pointerout", function (event) {
        if (card.contains(event.relatedTarget)) return;
        targetX = 0;
        targetY = 0;
        requestFrame();
      });
    });
  }

  function initGuideFilters() {
    var buttons = $$('[data-filter]');
    var items = $$('[data-category]');
    if (!buttons.length || !items.length) return;

    buttons.forEach(function (button) {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";

      button.addEventListener("click", function () {
        var filter = button.dataset.filter;
        buttons.forEach(function (other) {
          var active = other === button;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-selected", String(active));
        });

        items.forEach(function (item) {
          var visible = filter === "all" || item.dataset.category === filter;
          item.classList.toggle("is-filtered-out", !visible);
          item.setAttribute("aria-hidden", String(!visible));
        });
      });
    });
  }

  function initStoryControls() {
    var track = $("[data-story-track]");
    var previous = $("[data-story-prev]");
    var next = $("[data-story-next]");
    if (!track || !previous || !next) return;

    function step(direction) {
      var card = $(".story-card", track);
      if (!card) return;
      var gap = parseFloat(window.getComputedStyle(track).gap || "16");
      track.scrollBy({
        left: direction * (card.getBoundingClientRect().width + gap),
        behavior: reduced ? "auto" : "smooth"
      });
    }

    previous.addEventListener("click", function () { step(-1); });
    next.addEventListener("click", function () { step(1); });
  }

  function initBookingPicker(form) {
    var picker = $("[data-booking-picker]", form);
    if (!picker || picker.dataset.bound === "1") return null;
    picker.dataset.bound = "1";

    var config = data.booking || {};
    var weeklyHours = config.weeklyHours || {};
    var blockedDates = config.blockedDates || [];
    var blockedSlots = config.blockedSlots || {};
    var slotMinutes = Number(config.slotMinutes) || 30;
    var maxAdvanceDays = Number(config.maxAdvanceDays) || 45;
    var timeZone = config.timeZone || "America/Argentina/Cordoba";
    var monthLabel = $("[data-calendar-month]", picker);
    var daysGrid = $("[data-calendar-days]", picker);
    var previous = $("[data-calendar-prev]", picker);
    var next = $("[data-calendar-next]", picker);
    var selectedDayLabel = $("[data-selected-day]", picker);
    var timeSlots = $("[data-time-slots]", picker);
    var dateInput = $("[data-booking-date]", picker);
    var timeInput = $("[data-booking-time]", picker);
    var feedback = $("[data-booking-feedback]", picker);
    if (!monthLabel || !daysGrid || !previous || !next || !selectedDayLabel || !timeSlots || !dateInput || !timeInput || !feedback) return null;

    var selectedDate = "";
    var selectedTime = "";
    var now = getClinicNow();
    var viewYear = now.year;
    var viewMonth = now.month - 1;

    function pad(value) {
      return String(value).padStart(2, "0");
    }

    function toISO(year, month, day) {
      return year + "-" + pad(month) + "-" + pad(day);
    }

    function parseISO(iso) {
      var parts = iso.split("-").map(Number);
      return { year: parts[0], month: parts[1], day: parts[2] };
    }

    function shiftISO(iso, amount) {
      var parts = parseISO(iso);
      var shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12));
      return toISO(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
    }

    function getClinicNow() {
      try {
        var formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23"
        });
        var values = {};
        formatter.formatToParts(new Date()).forEach(function (part) {
          if (part.type !== "literal") values[part.type] = part.value;
        });
        var hour = Number(values.hour) % 24;
        return {
          year: Number(values.year),
          month: Number(values.month),
          day: Number(values.day),
          iso: values.year + "-" + values.month + "-" + values.day,
          minutes: hour * 60 + Number(values.minute)
        };
      } catch (_) {
        var local = new Date();
        return {
          year: local.getFullYear(),
          month: local.getMonth() + 1,
          day: local.getDate(),
          iso: toISO(local.getFullYear(), local.getMonth() + 1, local.getDate()),
          minutes: local.getHours() * 60 + local.getMinutes()
        };
      }
    }

    function minutesFor(time) {
      var parts = time.split(":").map(Number);
      return parts[0] * 60 + parts[1];
    }

    function timeFor(minutes) {
      return pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
    }

    function weekdayFor(iso) {
      var parts = parseISO(iso);
      return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
    }

    function longDate(iso) {
      var parts = parseISO(iso);
      var value = new Intl.DateTimeFormat("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC"
      }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function availableSlots(iso, current) {
      var currentNow = current || getClinicNow();
      var lastDate = shiftISO(currentNow.iso, maxAdvanceDays);
      if (iso < currentNow.iso || iso > lastDate || blockedDates.indexOf(iso) !== -1) return [];

      var windows = weeklyHours[String(weekdayFor(iso))] || [];
      var unavailable = blockedSlots[iso] || [];
      var slots = [];

      windows.forEach(function (range) {
        var start = minutesFor(range[0]);
        var end = minutesFor(range[1]);
        for (var value = start; value + slotMinutes <= end; value += slotMinutes) {
          var time = timeFor(value);
          var isPast = iso === currentNow.iso && value <= currentNow.minutes;
          if (!isPast && unavailable.indexOf(time) === -1) slots.push(time);
        }
      });

      return slots;
    }

    function monthNumber(year, month) {
      return year * 12 + month;
    }

    function setFeedback(message, state) {
      feedback.textContent = message || "";
      feedback.classList.toggle("is-error", state === "error");
      feedback.classList.toggle("is-ready", state === "ready");
    }

    function syncInputs() {
      dateInput.value = selectedDate;
      timeInput.value = selectedTime;
    }

    function renderCalendar() {
      now = getClinicNow();
      var maxDate = parseISO(shiftISO(now.iso, maxAdvanceDays));
      var firstMonth = monthNumber(now.year, now.month - 1);
      var lastMonth = monthNumber(maxDate.year, maxDate.month - 1);
      var viewedMonth = monthNumber(viewYear, viewMonth);
      var monthDate = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
      var daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0, 12)).getUTCDate();
      var offset = (monthDate.getUTCDay() + 6) % 7;

      monthLabel.textContent = new Intl.DateTimeFormat("es-AR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(monthDate);
      previous.disabled = viewedMonth <= firstMonth;
      next.disabled = viewedMonth >= lastMonth;
      daysGrid.innerHTML = "";

      for (var blank = 0; blank < offset; blank += 1) {
        var spacer = document.createElement("span");
        spacer.className = "calendar-day-spacer";
        spacer.setAttribute("aria-hidden", "true");
        daysGrid.appendChild(spacer);
      }

      for (var day = 1; day <= daysInMonth; day += 1) {
        var iso = toISO(viewYear, viewMonth + 1, day);
        var slots = availableSlots(iso, now);
        var button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-day";
        button.textContent = String(day);
        button.dataset.date = iso;
        button.disabled = slots.length === 0;
        button.classList.toggle("is-today", iso === now.iso);
        button.classList.toggle("is-selected", iso === selectedDate);
        button.setAttribute("aria-pressed", String(iso === selectedDate));
        button.setAttribute("aria-label", longDate(iso) + (slots.length ? ", con horarios disponibles" : ", sin disponibilidad"));
        daysGrid.appendChild(button);
      }
    }

    function renderTimes() {
      timeSlots.innerHTML = "";

      if (!selectedDate) {
        selectedDayLabel.textContent = "Elegí un día";
        var prompt = document.createElement("p");
        prompt.textContent = "Seleccioná un día disponible en el calendario.";
        timeSlots.appendChild(prompt);
        syncInputs();
        return;
      }

      var slots = availableSlots(selectedDate);
      selectedDayLabel.textContent = longDate(selectedDate);
      if (slots.indexOf(selectedTime) === -1) selectedTime = "";

      if (!slots.length) {
        var empty = document.createElement("p");
        empty.textContent = "Ya no quedan horarios para este día. Elegí otra fecha.";
        timeSlots.appendChild(empty);
      } else {
        slots.forEach(function (time) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = "time-slot";
          button.textContent = time;
          button.dataset.time = time;
          button.classList.toggle("is-selected", time === selectedTime);
          button.setAttribute("aria-pressed", String(time === selectedTime));
          button.setAttribute("aria-label", "Elegir turno a las " + time);
          timeSlots.appendChild(button);
        });
      }

      syncInputs();
    }

    function resetSelection() {
      now = getClinicNow();
      selectedDate = "";
      selectedTime = "";
      viewYear = now.year;
      viewMonth = now.month - 1;
      setFeedback("", "");
      renderCalendar();
      renderTimes();
    }

    function validateSelection() {
      if (!selectedDate) {
        setFeedback("Elegí un día disponible para continuar.", "error");
        var firstDay = $(".calendar-day:not(:disabled)", daysGrid);
        if (firstDay) firstDay.focus();
        return false;
      }
      if (!selectedTime) {
        setFeedback("Elegí uno de los horarios disponibles.", "error");
        var firstTime = $(".time-slot", timeSlots);
        if (firstTime) firstTime.focus();
        return false;
      }
      if (availableSlots(selectedDate).indexOf(selectedTime) === -1) {
        selectedTime = "";
        renderCalendar();
        renderTimes();
        setFeedback("Ese horario ya pasó o dejó de estar disponible. Elegí otro.", "error");
        return false;
      }
      syncInputs();
      setFeedback("Turno seleccionado: " + longDate(selectedDate) + " a las " + selectedTime + ".", "ready");
      return true;
    }

    previous.addEventListener("click", function () {
      if (previous.disabled) return;
      viewMonth -= 1;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
      }
      renderCalendar();
    });

    next.addEventListener("click", function () {
      if (next.disabled) return;
      viewMonth += 1;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
      }
      renderCalendar();
    });

    daysGrid.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-date]");
      if (!button || button.disabled) return;
      selectedDate = button.dataset.date;
      selectedTime = "";
      setFeedback("Ahora elegí un horario disponible.", "");
      renderCalendar();
      renderTimes();
      var firstTime = $(".time-slot", timeSlots);
      if (firstTime) firstTime.focus();
    });

    timeSlots.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-time]");
      if (!button) return;
      selectedTime = button.dataset.time;
      renderTimes();
      setFeedback("Turno seleccionado: " + longDate(selectedDate) + " a las " + selectedTime + ".", "ready");
    });

    renderCalendar();
    renderTimes();

    window.setInterval(function () {
      var previousNow = now.iso + ":" + now.minutes;
      now = getClinicNow();
      if (previousNow !== now.iso + ":" + now.minutes) {
        renderCalendar();
        renderTimes();
      }
    }, 60000);

    return {
      validate: validateSelection,
      reset: resetSelection,
      summary: function () {
        return selectedDate && selectedTime ? longDate(selectedDate) + " a las " + selectedTime : "";
      }
    };
  }

  function initContactForm() {
    var form = $("[data-contact-form]");
    var success = $("[data-form-success]");
    if (!form || !success || form.dataset.bound === "1") return;
    form.dataset.bound = "1";

    var submit = $('button[type="submit"]', form);
    var successName = $("[data-success-name]", success);
    var successBooking = $("[data-success-booking]", success);
    var resetButton = $("[data-form-reset]", success);
    var booking = initBookingPicker(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (form.classList.contains("is-sending")) return;
      if (!booking || !booking.validate()) return;
      if (!form.reportValidity()) return;

      form.classList.add("is-sending");
      if (submit) submit.disabled = true;

      window.setTimeout(function () {
        var rawName = form.elements.name.value.trim();
        var firstName = rawName ? rawName.split(/\s+/)[0] : "";
        if (successName) successName.textContent = firstName;
        if (successBooking) successBooking.textContent = booking.summary();
        form.classList.remove("is-sending");
        form.classList.add("is-sent");
        success.classList.add("is-visible");
        success.setAttribute("aria-hidden", "false");
        if (resetButton) resetButton.focus();
      }, 900);
    });

    if (resetButton) {
      resetButton.addEventListener("click", function () {
        form.reset();
        booking.reset();
        form.classList.remove("is-sent");
        success.classList.remove("is-visible");
        success.setAttribute("aria-hidden", "true");
        if (submit) submit.disabled = false;
        window.setTimeout(function () {
          var first = $("input", form);
          if (first) first.focus();
        }, 180);
      });
    }
  }

  function initYear() {
    $$('[data-year]').forEach(function (element) {
      element.textContent = String(new Date().getFullYear());
    });
  }

  function boot() {
    if (document.documentElement.dataset.petsgatesBooted === "1") return;
    document.documentElement.dataset.petsgatesBooted = "1";
    document.documentElement.classList.add("is-enhanced");

    safe(initHeader, "header");
    safe(initMobileMenu, "mobileMenu");
    safe(initSmoothAnchors, "smoothAnchors");
    safe(initScrollProgress, "scrollProgress");
    safe(initReveals, "reveals");
    safe(initMagneticButtons, "magneticButtons");
    safe(initTiltCards, "tiltCards");
    safe(initGuideFilters, "guideFilters");
    safe(initStoryControls, "storyControls");
    safe(initContactForm, "contactForm");
    safe(initYear, "year");

    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
